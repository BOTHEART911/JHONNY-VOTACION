/* ============================================================
 * CAPA 3 · SONIDO SIN RETARDO  (JHONNY VOTACIÓN) — FUNCIONAL
 *
 * Qué hace: descarga y decodifica los tres sonidos (ok / info /
 * err) al abrir la app y reemplaza sonar() para que suene en el
 * acto, sin el tirón del primer play() y sin que dos lecturas
 * seguidas se corten entre sí (hoy comparten un mismo <audio> por
 * tipo). Así el sonido queda pegado a la vibración.
 *
 * Instalación — pegar en index.html, al final del <body>, DESPUÉS
 * de <script src="app.js"></script>:
 *   <script src="capa-3-sonido.js"></script>
 *
 * Pareja: ninguna (capa autónoma). Es la capa de más peso en el
 * kiosco: en una fila de gente, cada lectura suena aparte.
 * Notas:
 *  - HONESTIDAD: el navegador NO deja sonar hasta el primer toque
 *    en la pantalla. El primer "Activar escaneo" ya sirve de toque
 *    y a partir de ahí queda desbloqueado.
 *  - Respaldo: si no hay Web Audio, si Cloudinary no da permiso
 *    (CORS) o si un mp3 no se pudo decodificar, se llama al sonar()
 *    original de app.js. Nunca te quedas sin sonido.
 *  - Mantiene un antirrebote de 60 ms POR TIPO (dos frames con el
 *    mismo QR no disparan dos pitos).
 *  - Para quitarla: borra esa línea del HTML.
 * ============================================================ */
(function () {
  'use strict';

  var sonarOrig = window.sonar;
  if (typeof sonarOrig !== 'function' || sonarOrig.__naSnd) return;

  /* SOUNDS es un const de app.js (script clásico): se ve desde aquí por nombre. */
  var URLS = (typeof SOUNDS !== 'undefined' && SOUNDS) ? SOUNDS : null;
  if (!URLS) return;

  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;                       // sin Web Audio: se queda el sonar() original

  var ctx = null;
  try { ctx = new AC(); } catch (e) { return; }

  var buffers = {};
  var ANTIRREBOTE_MS = 60;
  var ultimo = {};

  /* ---------- Precarga y decodificación ---------- */
  function cargar(kind, url) {
    return fetch(url, { mode: 'cors' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(function (ab) {
        return new Promise(function (res, rej) {
          var p = ctx.decodeAudioData(ab, res, rej);   // Safari viejo usa callbacks
          if (p && typeof p.then === 'function') p.then(res, rej);
        });
      })
      .then(function (buf) { buffers[kind] = buf; })
      .catch(function () { /* ese tipo se queda con el respaldo */ });
  }

  Object.keys(URLS).forEach(function (k) { if (URLS[k]) cargar(k, URLS[k]); });

  /* ---------- Desbloqueo en el primer toque ---------- */
  var desbloqueado = false;
  function desbloquear() {
    if (desbloqueado) return;
    desbloqueado = true;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      var s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination);
      s.start(0);
    } catch (e) {}
    ['pointerdown', 'touchend', 'click'].forEach(function (ev) {
      document.removeEventListener(ev, desbloquear, true);
    });
  }
  ['pointerdown', 'touchend', 'click'].forEach(function (ev) {
    document.addEventListener(ev, desbloquear, true);
  });

  /* ---------- El nuevo sonar() ---------- */
  function sonar(kind) {
    try {
      if (!kind || !URLS[kind]) return;
      var ahora = Date.now();
      if (ahora - (ultimo[kind] || 0) < ANTIRREBOTE_MS) return;
      ultimo[kind] = ahora;

      var buf = buffers[kind];
      if (!buf || !ctx || ctx.state !== 'running') return sonarOrig(kind);   // respaldo

      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch (e) {
      try { sonarOrig(kind); } catch (e2) {}
    }
  }
  sonar.__naSnd = true;
  window.sonar = sonar;
})();
