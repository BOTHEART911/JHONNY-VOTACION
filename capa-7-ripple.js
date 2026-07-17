/* ============================================================
 * CAPA 7 · ONDA AL TOCAR / RIPPLE  (JHONNY VOTACIÓN) — DECORATIVA LIGERA
 *
 * Qué hace: dibuja la onda dentro del botón tocado, en el punto
 * exacto del dedo, y la borra sola.
 *
 * Instalación — pegar en index.html, al final del <body>, DESPUÉS
 * de <script src="app.js"></script>:
 *   <script src="capa-7-ripple.js"></script>
 *
 * Pareja: capa-7-ripple.css  (los dos o ninguno).
 * Notas:
 *  - No hace preventDefault: no estorba a los onclick de app.js.
 *  - Salta los botones deshabilitados (el de "Registrar voto"
 *    mientras guarda) y respeta "reducir movimiento".
 *  - Red de seguridad: si la animación no termina, la onda se
 *    borra a los 700 ms.
 *  - No se pone en la cámara ni en el recuadro de resultado.
 * ============================================================ */
(function () {
  'use strict';

  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch (e) {}

  var TOCABLES = '.btn';

  document.addEventListener('pointerdown', function (ev) {
    var t = ev.target;
    if (!t || typeof t.closest !== 'function') return;
    var el = t.closest(TOCABLES);
    if (!el) return;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;

    var r;
    try { r = el.getBoundingClientRect(); } catch (e) { return; }
    if (!r || !r.width || !r.height) return;

    /* Solo tocamos la posición si era 'static' (no rompemos maquetación) */
    try {
      var pos = window.getComputedStyle(el).position;
      if (pos === 'static') el.style.position = 'relative';
    } catch (e) {}
    el.classList.add('na-rip-host');

    var x = (ev.clientX == null ? r.left + r.width / 2 : ev.clientX) - r.left;
    var y = (ev.clientY == null ? r.top + r.height / 2 : ev.clientY) - r.top;
    var d = Math.max(
      Math.hypot(x, y),
      Math.hypot(r.width - x, y),
      Math.hypot(x, r.height - y),
      Math.hypot(r.width - x, r.height - y)
    ) * 2;

    var onda = document.createElement('span');
    onda.className = 'na-rip';
    onda.style.width = onda.style.height = d + 'px';
    onda.style.left = (x - d / 2) + 'px';
    onda.style.top = (y - d / 2) + 'px';
    el.appendChild(onda);

    var quitar = function () { if (onda && onda.parentNode) onda.parentNode.removeChild(onda); };
    onda.addEventListener('animationend', quitar);
    setTimeout(quitar, 700);
  }, true);
})();
