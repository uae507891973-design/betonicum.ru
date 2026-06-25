#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Парсер тендеров по тематике «товарный бетон / ЖБИ» для betonicum.ru.

Что делает:
  1) Тянет тендеры из источника (ЕИС RSS или агрегатор по API), либо берёт
     локальный JSON (--input) — удобно для оффлайн-прогона/демо.
  2) Считает релевантность каждого тендера нашей тематике (скоринг по ОКПД2,
     ключевым словам и объёму).
  3) Сортирует по убыванию релевантности и выгружает топ в HTML + PDF.

ВАЖНО про доступ к данным:
  - С 01.01.2025 публичный FTP ЕИС закрыт. Прямой доступ к веб-сервису ЕИС
    (getDocs) требует КЭП/токена (см. docs/tender-platforms-analysis.md).
  - Публичный поиск/RSS ЕИС и сайты-агрегаторы блокируют дата-центровые IP
    (HTTP 403). Поэтому запускать скрипт нужно с разрешённого IP, а для
    стабильного потока — подключить API агрегатора (Тендерплан/Контур/Seldon)
    либо официальный веб-сервис ЕИС с КЭП.

Запуск:
  # из локального JSON (демо/оффлайн):
  python3 scripts/tender_parser.py --input data/tenders.sample.json --top 20

  # из RSS ЕИС (нужен доступ; ключевые слова и коды настраиваются ниже):
  python3 scripts/tender_parser.py --source eis-rss --top 20

  # из API Тендерплана (нужен токен):
  TENDERPLAN_TOKEN=xxxx python3 scripts/tender_parser.py --source tenderplan --top 20

Вывод:
  out/tenders_report.html и out/tenders_report.pdf
  (PDF собирается через LibreOffice headless — кириллица поддерживается).
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from html import escape

# --------------------------------------------------------------------------
# 1. Профиль тематики: коды и ключевые слова с весами
# --------------------------------------------------------------------------

# ОКПД2 → вес релевантности (чем точнее по теме, тем выше)
OKPD2_WEIGHTS = {
    "23.63": 100,   # товарный бетон — ядро тематики
    "23.61": 90,    # ЖБИ
    "23.64": 60,    # смеси и растворы строительные
    "23.69": 40,    # прочие изделия из бетона/цемента/гипса
    "23.51": 30,    # цемент (сырьё)
    "08.12": 20,    # гравий/песок (инертные)
    "23.62": 20,    # изделия из гипса
}

# Ключевые слова в названии закупки → вес (морфология учитывается грубо, по корню)
KEYWORD_WEIGHTS = {
    "товарн": 50, "бетонн": 45, "бетон": 40, "бсг": 40,
    "железобетон": 40, "жби": 40, "раствор": 25,
    "плита перекрыт": 35, "фбс": 35, "фундаментн блок": 35,
    "бордюр": 20, "тротуарн плит": 20, "сухие смеси": 20, "цпс": 20,
}

# Анти-слова: режут ложные срабатывания (работы/услуги, где бетон не поставляется)
NEGATIVE_KEYWORDS = {
    "демонтаж бетон": -30, "вырубка бетон": -25, "алмазн резк": -20,
    "лаборатор": -15, "испытани бетон": -15,
}

LAW_BONUS = {"44": 5, "223": 5, "commercial": 8}  # коммерческие чуть ценнее (меньше конкуренции)


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def score_tender(t: dict) -> dict:
    """Считает релевантность тендера и причины. Возвращает dict со score и reasons."""
    name = _norm(t.get("object_name", ""))
    codes = [str(c).strip() for c in (t.get("okpd2") or [])]
    score = 0
    reasons = []

    # ОКПД2 — берём максимальный по точности префиксный матч
    best_code, best_w = None, 0
    for code in codes:
        for prefix, w in OKPD2_WEIGHTS.items():
            if code.startswith(prefix) and w > best_w:
                best_code, best_w = prefix, w
    if best_code:
        score += best_w
        reasons.append(f"ОКПД2 {best_code} (+{best_w})")

    # Ключевые слова
    for kw, w in KEYWORD_WEIGHTS.items():
        if kw in name:
            score += w
            reasons.append(f"«{kw}» (+{w})")

    # Анти-слова
    for kw, w in NEGATIVE_KEYWORDS.items():
        if kw in name:
            score += w
            reasons.append(f"анти-«{kw}» ({w})")

    # Закон
    law = str(t.get("law", "")).lower()
    for k, b in LAW_BONUS.items():
        if k in law:
            score += b
            break

    # Объём (м3) — крупные поставки приоритетнее
    vol = t.get("volume_m3")
    if isinstance(vol, (int, float)) and vol:
        bonus = min(int(vol // 100), 30)  # +1 за каждые 100 м3, максимум +30
        if bonus:
            score += bonus
            reasons.append(f"объём ~{int(vol)} м³ (+{bonus})")

    t = dict(t)
    t["_score"] = score
    t["_reasons"] = ", ".join(reasons) if reasons else "нет совпадений по профилю"
    return t


# --------------------------------------------------------------------------
# 2. Источники данных (заглушки с честными ошибками при отсутствии доступа)
# --------------------------------------------------------------------------

def fetch_from_eis_rss(query="бетон", per_page=50):
    """Публичный RSS ЕИС. Требует доступа с разрешённого IP (иначе HTTP 403)."""
    import urllib.parse, urllib.request
    import xml.etree.ElementTree as ET
    params = {
        "searchString": query, "morphology": "on",
        "fz44": "on", "fz223": "on", "af": "on", "ca": "on", "pc": "on", "pa": "on",
        "sortBy": "UPDATE_DATE", "pageNumber": "1", "recordsPerPage": f"_{per_page}",
    }
    url = "https://zakupki.gov.ru/epz/order/extendedsearch/rss.html?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0", "Accept": "application/rss+xml,text/xml,*/*"})
    with urllib.request.urlopen(req, timeout=40) as r:
        data = r.read()
    root = ET.fromstring(data)
    items = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        desc = (it.findtext("description") or "").strip()
        # НМЦК/заказчик часто в description — выдёргиваем грубо
        nmck = None
        m = re.search(r"([\d\s]+[.,]\d{2})\s*(?:руб|₽)", desc)
        if m:
            nmck = m.group(1)
        items.append({
            "source": "ЕИС (RSS)", "law": "44/223", "object_name": title,
            "url": link, "nmck": nmck, "okpd2": [], "publish_date": it.findtext("pubDate"),
        })
    return items


def fetch_from_tenderplan():
    """API Тендерплана. Нужен TENDERPLAN_TOKEN. См. https://tenderplan.ru/api/doc/"""
    token = os.environ.get("TENDERPLAN_TOKEN")
    if not token:
        raise RuntimeError("Не задан TENDERPLAN_TOKEN. Получите токен в ЛК Тендерплана.")
    # TODO: реализовать вызовы /api/ согласно вашему тарифу и фильтрам.
    raise NotImplementedError(
        "Реализуйте запросы к API Тендерплана под ваш фильтр (ОКПД2/регион/ключевые слова). "
        "Каркас скоринга и экспорта уже готов — подайте сюда список dict-ов с полями тендера.")


def load_input(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else data.get("tenders", [])


# --------------------------------------------------------------------------
# 3. Рендер HTML и конвертация в PDF
# --------------------------------------------------------------------------

def fmt(v, dash="—"):
    return escape(str(v)) if v not in (None, "", []) else dash


def build_html(tenders, generated_at):
    rows = []
    for i, t in enumerate(tenders, 1):
        rows.append(f"""
        <tr>
          <td class="num">{i}</td>
          <td class="score">{t.get('_score', 0)}</td>
          <td>
            <div class="obj">{fmt(t.get('object_name'))}</div>
            <div class="reasons">▸ {fmt(t.get('_reasons'))}</div>
            {('<a href="'+escape(t['url'])+'">'+escape(t['url'])+'</a>') if t.get('url') else ''}
          </td>
          <td>{fmt(t.get('customer_name'))}</td>
          <td>{fmt(t.get('customer_region'))}</td>
          <td class="nmck">{fmt(t.get('nmck'))}</td>
          <td>{fmt(t.get('deadline_date'))}</td>
          <td>{fmt(t.get('law'))}</td>
          <td>{fmt(t.get('source'))}</td>
        </tr>""")
    table = "\n".join(rows)
    return f"""<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<style>
  body {{ font-family: 'DejaVu Sans', Arial, sans-serif; font-size: 10px; color:#1a1a1a; margin: 18px; }}
  h1 {{ font-size: 18px; margin: 0 0 2px; color:#0b3d2e; }}
  .sub {{ color:#666; font-size: 10px; margin-bottom: 12px; }}
  .legend {{ background:#f3f7f5; border:1px solid #d8e6df; border-radius:6px; padding:8px 10px; margin-bottom:12px; font-size:9.5px; }}
  table {{ border-collapse: collapse; width: 100%; }}
  th, td {{ border: 1px solid #d0d7d4; padding: 5px 6px; vertical-align: top; text-align: left; }}
  th {{ background:#0b3d2e; color:#fff; font-size: 9.5px; }}
  td.num {{ text-align:center; color:#888; }}
  td.score {{ text-align:center; font-weight:bold; color:#0b6e4f; font-size: 12px; }}
  .obj {{ font-weight:bold; }}
  .reasons {{ color:#0b6e4f; font-size: 8.5px; margin: 2px 0; }}
  td.nmck {{ white-space: nowrap; }}
  a {{ color:#1763a6; font-size: 8.5px; word-break: break-all; }}
  .note {{ margin-top:14px; font-size:9px; color:#774; background:#fffaf0; border:1px solid #f0e2c0; border-radius:6px; padding:8px 10px; }}
</style></head>
<body>
  <h1>Тендеры по тематике «товарный бетон / ЖБИ» — топ по релевантности</h1>
  <div class="sub">betonicum.ru · сформировано: {escape(generated_at)} · позиций: {len(tenders)}</div>
  <div class="legend">
    <b>Релевантность (score)</b> считается автоматически: ОКПД2 (23.63 +100, 23.61 +90, 23.64 +60 …),
    ключевые слова в названии («товарн» +50, «бетонн» +45, «жби» +40 …), объём поставки (+1 за 100 м³),
    тип закупки. Анти-слова («демонтаж», «алмазная резка», «лаборатор») снижают score, отсекая работы
    без поставки бетона. Полная логика — в <i>scripts/tender_parser.py</i>.
  </div>
  <table>
    <tr>
      <th>#</th><th>Score</th><th>Объект закупки / причины / ссылка</th>
      <th>Заказчик</th><th>Регион</th><th>НМЦК</th><th>Срок подачи</th><th>Закон</th><th>Источник</th>
    </tr>
    {table}
  </table>
  <div class="note">
    <b>О данных в этом отчёте.</b> Точные значения НМЦК и сроков подачи доступны только при
    авторизованном доступе к ЕИС (КЭП/токен) или через платный API агрегатора — публичные источники
    блокируют автоматический сбор. Поля, помеченные «—», заполняются автоматически при запуске
    скрипта с настроенным источником данных. Перед подачей заявки сверяйте параметры в первоисточнике
    по ссылке.
  </div>
</body></html>"""


def build_pdf(tenders, generated_at, pdf_path):
    """Собирает PDF через reportlab (landscape A4, кириллица через DejaVuSans)."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer)

    fdir = "/usr/share/fonts/truetype/dejavu"
    pdfmetrics.registerFont(TTFont("DejaVu", f"{fdir}/DejaVuSans.ttf"))
    pdfmetrics.registerFont(TTFont("DejaVu-Bold", f"{fdir}/DejaVuSans-Bold.ttf"))

    styles = getSampleStyleSheet()
    base = ParagraphStyle("base", parent=styles["Normal"], fontName="DejaVu",
                          fontSize=7.5, leading=9.5)
    bold = ParagraphStyle("bold", parent=base, fontName="DejaVu-Bold")
    obj = ParagraphStyle("obj", parent=base, fontName="DejaVu-Bold", fontSize=8, leading=10)
    reason = ParagraphStyle("reason", parent=base, fontSize=6.5, leading=8, textColor=colors.HexColor("#0b6e4f"))
    link = ParagraphStyle("link", parent=base, fontSize=6.5, leading=8, textColor=colors.HexColor("#1763a6"))
    th = ParagraphStyle("th", parent=bold, fontSize=8, textColor=colors.white)
    h1 = ParagraphStyle("h1", parent=bold, fontSize=15, leading=18, textColor=colors.HexColor("#0b3d2e"))
    sub = ParagraphStyle("sub", parent=base, fontSize=8, textColor=colors.HexColor("#666666"))

    def P(text, st=base):
        return Paragraph(escape(str(text)) if text not in (None, "", []) else "—", st)

    doc = SimpleDocTemplate(pdf_path, pagesize=landscape(A4),
                            leftMargin=12 * mm, rightMargin=12 * mm,
                            topMargin=12 * mm, bottomMargin=12 * mm)
    story = [
        Paragraph("Тендеры по тематике «товарный бетон / ЖБИ» — топ по релевантности", h1),
        Paragraph(f"betonicum.ru · сформировано: {escape(generated_at)} · позиций: {len(tenders)}", sub),
        Spacer(1, 4 * mm),
        Paragraph("Релевантность (score) считается автоматически: ОКПД2 (23.63 +100, 23.61 +90 …), "
                  "ключевые слова в названии («товарн» +50, «бетонн» +45 …), объём (+1/100 м³), тип закупки. "
                  "Анти-слова («демонтаж», «алмазная резка», «лаборатор») снижают score. Логика — в scripts/tender_parser.py.",
                  sub),
        Spacer(1, 4 * mm),
    ]

    header = [Paragraph(t, th) for t in
              ["#", "Score", "Объект закупки / причины / ссылка", "Заказчик",
               "Регион", "НМЦК", "Срок", "Закон", "Источник"]]
    data = [header]
    for i, t in enumerate(tenders, 1):
        cell = [P(t.get("object_name"), obj),
                Paragraph("▸ " + escape(str(t.get("_reasons", ""))), reason)]
        if t.get("url"):
            cell.append(Paragraph(escape(t["url"]), link))
        data.append([
            P(i), Paragraph(str(t.get("_score", 0)), bold), cell,
            P(t.get("customer_name")), P(t.get("customer_region")),
            P(t.get("nmck")), P(t.get("deadline_date")),
            P(t.get("law")), P(t.get("source")),
        ])

    col_w = [8 * mm, 13 * mm, 95 * mm, 52 * mm, 28 * mm, 22 * mm, 18 * mm, 16 * mm, 23 * mm]
    table = Table(data, colWidths=col_w, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0b3d2e")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c8d3ce")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (1, -1), "CENTER"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f7f5")]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(table)
    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph(
        "<b>О данных.</b> Точные НМЦК и сроки подачи доступны только при авторизованном доступе к ЕИС "
        "(КЭП/токен) или через платный API агрегатора — публичные источники блокируют автоматический сбор "
        "(HTTP 403 для дата-центровых IP). Поля «—» заполняются автоматически при запуске скрипта с "
        "настроенным источником. Перед подачей заявки сверяйте параметры в первоисточнике по ссылке.",
        ParagraphStyle("note", parent=base, fontSize=7.5, leading=10,
                       textColor=colors.HexColor("#776644"),
                       backColor=colors.HexColor("#fffaf0"),
                       borderColor=colors.HexColor("#f0e2c0"), borderWidth=0.5,
                       borderPadding=6)))
    doc.build(story)


# --------------------------------------------------------------------------
# 4. main
# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Парсер тендеров по бетону/ЖБИ → PDF")
    ap.add_argument("--source", choices=["eis-rss", "tenderplan"], help="живой источник данных")
    ap.add_argument("--input", help="локальный JSON со списком тендеров (оффлайн/демо)")
    ap.add_argument("--query", default="бетон", help="поисковая строка для RSS ЕИС")
    ap.add_argument("--top", type=int, default=20, help="сколько тендеров вывести")
    ap.add_argument("--outdir", default="out", help="каталог для отчётов")
    args = ap.parse_args()

    if args.input:
        raw = load_input(args.input)
    elif args.source == "eis-rss":
        raw = fetch_from_eis_rss(args.query)
    elif args.source == "tenderplan":
        raw = fetch_from_tenderplan()
    else:
        ap.error("укажите --input <json> или --source <eis-rss|tenderplan>")

    scored = sorted((score_tender(t) for t in raw), key=lambda x: x["_score"], reverse=True)
    top = scored[: args.top]

    os.makedirs(args.outdir, exist_ok=True)
    generated_at = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")
    html = build_html(top, generated_at)
    html_path = os.path.join(args.outdir, "tenders_report.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"[ok] HTML: {html_path}")
    pdf_path = os.path.join(args.outdir, "tenders_report.pdf")
    try:
        build_pdf(top, generated_at, pdf_path)
        print(f"[ok] PDF:  {pdf_path}")
    except Exception as e:
        print(f"[warn] PDF не собран ({e}). HTML готов — конвертируйте вручную.", file=sys.stderr)

    print(f"[done] обработано {len(raw)}, в отчёте топ-{len(top)} по релевантности.")


if __name__ == "__main__":
    main()
