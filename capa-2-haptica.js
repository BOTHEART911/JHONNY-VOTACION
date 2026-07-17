/* ============================================================
 * CAPA 2 · VIBRACIÓN / HÁPTICA  (JHONNY VOTACIÓN) — FUNCIONAL
 *
 * Qué hace: un golpecito corto al tocar botones, el campo del
 * documento y el fondo del modal; y una vibración con carácter
 * cuando sale un aviso (toast) de error, de éxito o normal.
 *
 * Instalación — pegar en index.html, al final del <body>, DESPUÉS
 * de <script src="app.js"></script>:
 *   <script src="capa-2-haptica.js"></script>
 *
 * Pareja: ninguna (capa autónoma).
 * Notas:
 *  - HONESTIDAD: iOS (iPhone/iPad) NO permite vibrar desde la web.
 *    Ahí esta capa no hace absolutamente nada. En Android sí.
 *  - NO toca vibrar() ni el escaneo: los resultados de lectura
 *    (registrado / ya votó / no está / error) YA vibran solos en
 *    app.js y esta capa no los duplica.
 *  - Para quitarla: borra esa línea del HTML.
 *  - Se apaga con "reducir movimiento" del sistema.
 * ============================================================ */
(function () {
  'use strict';

  if (!navigator || typeof navigator.vibrate !== 'function') return;  // iOS y equipos sin motor
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch (e) {}

  var TOCABLES = '.btn, .field, .scrim';
  var ANTIRREBOTE_MS = 40;
  var ultimo = 0;

  function zumbar(patron, saltarAntirrebote) {
    var ahora = Date.now();
    if (!saltarAntirrebote && ahora - ultimo < ANTIRREBOTE_MS) return;
    ultimo = ahora;
    try { navigator.vibrate(patron); } catch (e) {}
  }

  /* --- Toque: botones, campo, fondo del modal --- */
  document.addEventListener('pointerdown', function (ev) {
    var t = ev.target;
    if (!t || typeof t.closest !== 'function') return;
    var el = t.closest(TOCABLES);
    if (!el) return;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    zumbar(10, false);
  }, true);

  /* --- Avisos: envolvemos window.toast sin tocar su código --- */
  var toastOrig = window.toast;
  if (typeof toastOrig === 'function' && !toastOrig.__naHap) {
    var envuelto = function (msg, kind) {
      try {
        var k = String(kind || '');
        if (k === 'err')      zumbar([90, 50, 90], true);
        else if (k === 'ok')  zumbar(45, true);
        else                  zumbar(25, true);
      } catch (e) {}
      return toastOrig.apply(this, arguments);
    };
    envuelto.__naHap = true;
    window.toast = envuelto;
  }
})();
