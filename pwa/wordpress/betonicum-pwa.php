<?php
/**
 * Plugin Name: Betonicum PWA
 * Description: Подключает PWA-слой (manifest, service worker, скрипт регистрации) к сайту betonicum.ru.
 * Version: 1.0.0
 *
 * Установка: скопировать файл в wp-content/mu-plugins/ (mu-plugins активируются автоматически).
 * Файлы /manifest.webmanifest, /sw.js, /offline.html и каталог /pwa должны лежать в корне сайта.
 *
 * MIME для манифеста (если сервер не отдаёт его сам):
 *   nginx:  types { application/manifest+json webmanifest; }
 *   apache: AddType application/manifest+json .webmanifest
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Метатеги PWA в <head> каждой страницы. */
add_action( 'wp_head', function () {
	?>
	<link rel="manifest" href="/manifest.webmanifest">
	<meta name="theme-color" content="#16314f">
	<meta name="mobile-web-app-capable" content="yes">
	<meta name="apple-mobile-web-app-capable" content="yes">
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
	<meta name="apple-mobile-web-app-title" content="Betonicum">
	<link rel="apple-touch-icon" href="/pwa/icons/icon-192.png">
	<?php
}, 1 );

/** Скрипт регистрации service worker и кнопок установки/сохранения. */
add_action( 'wp_enqueue_scripts', function () {
	wp_enqueue_script(
		'betonicum-pwa',
		home_url( '/pwa/js/pwa-register.js' ),
		array(),
		'1.0.0',
		array( 'in_footer' => true, 'strategy' => 'defer' )
	);
} );

/**
 * Помечает ссылки на PDF в контенте атрибутом data-pwa-save,
 * чтобы скрипт добавил к ним кнопку «Сохранить офлайн».
 */
add_filter( 'the_content', function ( $content ) {
	return preg_replace(
		'/<a\s(?![^>]*data-pwa-save)([^>]*href="[^"]+\.pdf"[^>]*)>/i',
		'<a data-pwa-save $1>',
		$content
	);
} );
