/* ============================================================
   JHONNY VOTACIÓN — app.js
   Un escáner y nada más: se activa una vez y lee QR tras QR sin
   volver a tocar la pantalla. Cada lectura registra el voto en la
   hoja VOTOS (endpoint voto.registrar del JHONNY CORE) y el tablero
   de la app privada se entera solo (Vivo.gs → canal 'votacion').
   Patrón de shell/instalar/versión: el mismo de la app pública.
   ============================================================ */

/* URL del Web App del backend JHONNY CORE (/exec) */
const API_URL = 'https://script.google.com/macros/s/AKfycbw9CZ9ra6q1KI88M3U9IsYP861JOCFD4-xrV1b0UFYhL1amBjAqTTmtNXi42vwLI_h6Hw/exec';

const APP_ICON   = 'https://res.cloudinary.com/dqqeavica/image/upload/v1753538807/JHONNY_PERDOMO_dn3dah.png';
const APP_BANNER = 'https://res.cloudinary.com/dqqeavica/image/upload/v1753538919/BANNER_JHONNY_e0yw7m.png';

/* Respaldo de lectura para navegadores sin BarcodeDetector (iOS/Safari) */
const JSQR_CDN = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';

/* Sonidos (los mismos del index de referencia de esta app) */
const SOUNDS = {
  ok:   'https://res.cloudinary.com/dqqeavica/video/upload/v1759011577/Pay_success_t5aawh.mp3',
  info: 'https://res.cloudinary.com/dqqeavica/video/upload/v1759011578/Default_notification_pkp4wr.mp3',
  err:  'https://res.cloudinary.com/dqqeavica/video/upload/v1759011578/Low_battery_d5qua1.mp3'
};

/* ---------- Utilidades ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const app = $('#app');
const layer = $('#layer');
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const onlyDig = s => String(s || '').replace(/\D/g, '');
const val = id => (($('#' + id) || {}).value || '').trim();

function toast(msg, kind = '') { const t = h(`<div class="toast ${kind}">${esc(msg)}</div>`); layer.appendChild(t); setTimeout(() => t.remove(), 3200); }
function hideSplash() { const s = $('#splash'); if (s && !s.classList.contains('hide')) { s.classList.add('hide'); setTimeout(() => s.remove(), 520); } }

/* Un solo objeto Audio por tipo: en un día de votación esto suena cientos de
   veces y crear un Audio nuevo cada vez termina ahogando el navegador. */
const _audio = {};
function sonar(kind) {
  try {
    const url = SOUNDS[kind]; if (!url) return;
    let a = _audio[kind];
    if (!a) { a = new Audio(url); a.preload = 'auto'; _audio[kind] = a; }
    a.currentTime = 0; a.play().catch(() => {});
  } catch (e) {}
}
function vibrar(patron) { try { if (navigator.vibrate) navigator.vibrate(patron); } catch (e) {} }

/* ---------- Cliente API ---------- */
let _apiActivas = 0;
function loaderOn() { _apiActivas++; const b = $('#ios-loader'); if (b) b.classList.add('active'); }
function loaderOff() { _apiActivas = Math.max(0, _apiActivas - 1); if (_apiActivas === 0) { const b = $('#ios-loader'); if (b) b.classList.remove('active'); } }
async function api(action, params = {}, opts = {}) {
  const qs = new URLSearchParams(Object.assign({ action }, params)).toString();
  if (!opts.silencio) loaderOn();
  try {
    const res = await fetch(`${API_URL}?${qs}`, { method: 'GET' });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Error del servidor');
    return json.data;
  } finally { if (!opts.silencio) loaderOff(); }
}

/* ============================================================
   PWA: INSTALACIÓN  (mismo patrón de la app pública)
   ============================================================ */
let deferredPrompt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: installed)').matches || window.navigator.standalone === true;
const isIOS = () => /(iphone|ipad|ipod)/i.test(navigator.userAgent || '');
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (location.hash === '#/instalar') updateInstallSection(); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; toast('¡App instalada!', 'ok'); });

function updateInstallSection() {
  const and = $('#install-android'), ios = $('#install-ios'); if (!and || !ios) return;
  and.classList.add('hidden'); ios.classList.add('hidden');
  if (isIOS()) { ios.classList.remove('hidden'); return; }
  and.classList.remove('hidden');
  const b = $('#btn-install'), man = $('#install-manual');
  if (deferredPrompt) { if (b) b.style.display = ''; if (man) man.classList.add('hidden'); }
  else { if (b) b.style.display = 'none'; if (man) man.classList.remove('hidden'); }
}

/* ============================================================
   VERSIÓN + AUTO-UPDATE  (lee version.js por texto)
   ============================================================ */
let APP_VERSION_LOADED = '', __verInFlight = false;
function paintVersion(v) { $$('.app-version-line').forEach(el => el.textContent = 'Versión ' + v); }
async function checkVersion() {
  if (__verInFlight) return; __verInFlight = true;
  try {
    const r = await fetch('./version.js?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const raw = await r.text();
    const m = raw.match(/version['"]?\s*[:=]\s*['"]([^'"]+)['"]/i) || raw.match(/(\d{4}\.\d{2}\.\d{2}\.\d+|\d+\.\d+(?:\.\d+)?)/);
    const v = m ? String(m[1]).trim() : '';
    if (!v) return;
    if (!APP_VERSION_LOADED) { APP_VERSION_LOADED = v; paintVersion(v); return; }
    if (v !== APP_VERSION_LOADED) {
      /* OJO: si el escáner está corriendo NO se recarga a mitad de una fila de
         gente. Se espera a que lo apaguen. */
      if (SCAN.on) return;
      try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {}
      location.reload();
    }
  } finally { __verInFlight = false; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });

/* ---------- Constructores ---------- */
function footBrand() { return `<img class="brand-banner" src="${APP_BANNER}" alt="" onerror="this.style.display='none'" /><p class="app-version-line">Versión —</p>`; }
function saving(btn, on) { btn.disabled = on; btn.dataset.txt = btn.dataset.txt || btn.innerHTML; btn.innerHTML = on ? `<span class="spinner"></span>` : btn.dataset.txt; }

/* ---------- Modal ---------- */
function openSheet(html) {
  closeLayer();
  const ov = h(`<div class="scrim"></div>`);
  const sh = h(`<div class="sheet">${html}</div>`);
  layer.appendChild(ov); layer.appendChild(sh);
  document.body.classList.add('sheet-open');
  ov.onclick = closeLayer;
  return sh;
}
function closeLayer() {
  $$('.scrim, .sheet', layer).forEach(el => el.remove());
  document.body.classList.remove('sheet-open');
}

/* ============================================================
   RÚTER
   ============================================================ */
function go(route) { location.hash = '#/' + route; }
window.addEventListener('hashchange', render);
function render() {
  const route = (location.hash.replace(/^#\//, '') || '').split('?')[0];
  if (route !== 'escaner') scanStop(); // salir de la vista apaga la cámara
  if (route === 'instalar') return viewInstalar();
  return viewEscaner();
}

/* ============================================================
   VISTA INSTALAR  (gate)
   ============================================================ */
function viewInstalar() {
  app.innerHTML = `
    <div class="login-wrap"><div class="login-card">
      <img class="login-logo" src="${APP_ICON}" alt="Jhonny Perdomo" />
      <h1 class="login-title">Registro de Votación</h1>
      <p class="login-sub">Instala la aplicación: la cámara del escáner funciona mucho mejor como app instalada que dentro del navegador.</p>

      <div id="install-android" class="hidden" style="margin-top:16px;">
        <button id="btn-install" class="btn btn-primary btn-block" style="display:none;">📲 Instalar aplicación</button>
        <div id="install-manual" class="hidden ios-steps-wrap">
          <p class="small" style="text-align:left;color:var(--muted);">Para instalarla en tu equipo:</p>
          <ol class="ios-steps">
            <li>Abre el menú <b>⋮</b> del navegador (arriba a la derecha).</li>
            <li>Elige <b>“Instalar aplicación”</b> o <b>“Añadir a la pantalla de inicio”</b>.</li>
            <li>Confirma con <b>“Instalar”</b>.</li>
          </ol>
        </div>
        <button id="btn-cont-web" class="btn btn-ghost btn-block" style="margin-top:10px;">🌐 Continuar en el navegador</button>
      </div>
      <div id="install-ios" class="hidden" style="margin-top:16px;">
        <p class="small" style="text-align:left;color:var(--muted);">En tu iPhone o iPad:</p>
        <ol class="ios-steps"><li>Pulsa <b>Compartir</b> en Safari.</li><li>Elige <b>“Añadir a pantalla de inicio”</b>.</li><li>Pulsa <b>“Añadir”</b>.</li></ol>
        <button id="btn-cont-web-ios" class="btn btn-ghost btn-block" style="margin-top:8px;">🌐 Continuar en el navegador</button>
      </div>

      ${footBrand()}
    </div></div>`;
  app.hidden = false; hideSplash(); paintVersion(APP_VERSION_LOADED || (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''));
  updateInstallSection();
  const cont = () => { sessionStorage.setItem('continuedWeb', '1'); go('escaner'); };
  const bi = $('#btn-install');
  if (bi) bi.onclick = async () => {
    if (!deferredPrompt) { toast('La instalación aún no está disponible. Usa el menú del navegador.'); return; }
    const dp = deferredPrompt; dp.prompt(); try { await dp.userChoice; } catch (e) {} deferredPrompt = null; updateInstallSection();
  };
  const cw = $('#btn-cont-web'); if (cw) cw.onclick = cont;
  const cwi = $('#btn-cont-web-ios'); if (cwi) cwi.onclick = cont;
}

/* ============================================================
   VISTA ESCÁNER
   ============================================================ */
function viewEscaner() {
  app.innerHTML = `
    <div class="appbar">
      <img class="mark-img" src="${APP_ICON}" alt="" />
      <div class="who"><b>Registro de Votación</b><span>Jhonny Perdomo</span></div>
      <div class="cnt" id="sc-cnt" title="Votos registrados en este dispositivo">0</div>
    </div>

    <div class="pad stack">
      <div class="cam" id="sc-cam">
        <video id="sc-video" playsinline muted></video>
        <div class="cam-frame"></div>
        <div class="cam-off" id="sc-off">
          <div class="cam-off-ico">📷</div>
          <p class="muted small">El escáner está apagado.<br/>Actívalo y apunta al QR de la app.</p>
        </div>
      </div>

      <div class="modo-sw" id="sc-modo">
        <button type="button" data-m="uno">Uno a uno</button>
        <button type="button" data-m="lote">Lote · varios QR</button>
      </div>

      <div id="sc-res" class="res res-idle">
        <div class="res-t" id="sc-res-t">Listo para escanear</div>
        <div class="res-s" id="sc-res-s">Cada lectura registra el voto al instante.</div>
      </div>

      <div id="sc-lote" class="stack hidden">
        <div class="lote-cinta" id="lote-cinta">
          <span id="lote-msg">Modo lote: apunta a varias tarjetas juntas.</span>
          <span class="lote-pend" id="lote-pend"></span>
        </div>
        <div class="lote-lista" id="lote-lista"></div>
      </div>

      <button id="sc-toggle" class="btn btn-primary btn-block">▶️ Activar escaneo</button>
      <button id="sc-doc" class="btn btn-ghost btn-block">🆘 Ayuda: registrar con DOCUMENTO</button>

      ${footBrand()}
    </div>`;
  app.hidden = false; hideSplash();
  paintVersion(APP_VERSION_LOADED || (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''));
  $('#sc-cnt').textContent = String(SCAN.total);
  $('#sc-toggle').onclick = () => (SCAN.on ? scanStop() : scanStart());
  $('#sc-doc').onclick = sheetDocumento;
  $$('#sc-modo button').forEach(b => { b.onclick = () => cambiarModo(b.dataset.m === 'lote'); });
  pintarToggle();
  pintarModo();
  pintarPanelLote();
}

function pintarToggle() {
  const b = $('#sc-toggle'); if (!b) return;
  b.innerHTML = SCAN.on ? '⏹️ Desactivar escaneo' : '▶️ Activar escaneo';
  b.classList.toggle('btn-primary', !SCAN.on);
  b.classList.toggle('btn-danger', SCAN.on);
  const off = $('#sc-off'); if (off) off.classList.toggle('hidden', SCAN.on);
  const cam = $('#sc-cam'); if (cam) cam.classList.toggle('live', SCAN.on);
}

function resultado(kind, titulo, sub) {
  const box = $('#sc-res'); if (!box) return;
  box.className = 'res res-' + kind;
  $('#sc-res-t').textContent = titulo;
  $('#sc-res-s').textContent = sub || '';
  box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
}

/* ============================================================
   MOTOR DE ESCANEO
   Permanente: se activa UNA vez y sigue leyendo. Nadie vuelve a
   tocar la pantalla entre persona y persona.
   ============================================================ */
const SCAN = { on: false, stream: null, det: null, raf: null, busy: false, total: 0, vistos: new Map(), geo: null,
  /* LOTE 22/07: varios QR en el mismo fotograma */
  lote: false, detLote: null, geos: null, cola: null, enviando: false, ultEnvio: 0, lista: [] };
const COOLDOWN_MS = 5000;  // el mismo QR delante de la cámara no se relee en 5 s
const NO_HAY = 'NO_HAY';
/* Lote: cuántos IDs viajan juntos, cada cuánto se manda la tanda y
   cuántas líneas se guardan en la lista de pantalla. */
const LOTE_ENVIO = 12;
const LOTE_MS = 600;
const LOTE_LISTA = 40;

async function scanStart() {
  if (SCAN.on) return;
  const video = $('#sc-video'); if (!video) return;
  try {
    /* En lote se pide el cuadro más grande que dé el equipo: una tarjeta de
       4 cm necesita píxeles de sobra para que se lean VARIAS a la vez.
       El modo uno a uno se queda con 1280x720, igual que siempre. */
    const pide = SCAN.lote ? { w: 1920, h: 1080 } : { w: 1280, h: 720 };
    SCAN.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: pide.w }, height: { ideal: pide.h } },
      audio: false
    });
  } catch (e) {
    resultado('err', 'Sin cámara', 'El navegador no dio permiso o el equipo no tiene cámara.');
    sonar('err');
    return;
  }
  video.srcObject = SCAN.stream;
  try { await video.play(); } catch (e) {}
  try { await prepararDetector(); } catch (e) {
    scanStop();
    resultado('err', 'No se pudo iniciar el lector', 'Revisa la conexión y vuelve a intentarlo.');
    return;
  }
  /* El lector múltiple es OTRO: BarcodeDetector ya devuelve todos los
     códigos, pero jsQR (el respaldo de iPhone) devuelve CERO cuando hay
     dos o más en el cuadro. Si no se puede preparar, se vuelve al modo
     uno a uno en vez de dejar al operador escaneando en vano. */
  if (SCAN.lote) {
    try {
      SCAN.detLote = await window.JPLOTE.preparar(SCAN.det);
    } catch (e) {
      SCAN.lote = false; SCAN.detLote = null;
      pintarModo(); pintarPanelLote();
      resultado('err', 'Modo lote no disponible', 'No se pudo cargar el lector múltiple. Sigues en uno a uno.');
      sonar('err');
    }
  }
  SCAN.on = true;
  try { if ('wakeLock' in navigator) SCAN._wake = await navigator.wakeLock.request('screen'); } catch (e) {}
  pintarToggle();
  resultado('idle', 'Escaneando…', 'Apunta al QR. No hay que oprimir nada entre persona y persona.');
  loopScan();
}

function scanStop() {
  if (!SCAN.on && !SCAN.stream) return;
  SCAN.on = false;
  if (SCAN.raf) { cancelAnimationFrame(SCAN.raf); SCAN.raf = null; }
  if (SCAN.stream) { SCAN.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} }); SCAN.stream = null; }
  const v = $('#sc-video'); if (v) v.srcObject = null;
  SCAN.geo = null;                    // apaga el marco/punto verde de la capa 8
  SCAN.geos = null;                   // idem para los marcos del modo lote
  try { if (SCAN._wake) { SCAN._wake.release(); SCAN._wake = null; } } catch (e) {}
  pintarToggle();
  const box = $('#sc-res'); if (box && box.classList.contains('res-idle')) resultado('idle', 'Escáner apagado', 'Actívalo para seguir registrando.');
}

/* BarcodeDetector nativo si el equipo lo tiene (Android/Chrome: es el más
   rápido, va en el sistema). Si no, jsQR desde CDN (Safari/iOS). */
async function prepararDetector() {
  if (SCAN.det) return;
  if ('BarcodeDetector' in window) {
    try {
      const fmts = await window.BarcodeDetector.getSupportedFormats();
      if (fmts.indexOf('qr_code') >= 0) {
        const d = new window.BarcodeDetector({ formats: ['qr_code'] });
        SCAN.det = { tipo: 'nativo', d: d };
        return;
      }
    } catch (e) {}
  }
  await cargarJsQR();
  SCAN.det = { tipo: 'jsqr', canvas: document.createElement('canvas') };
}

function cargarJsQR() {
  if (window.jsQR) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = JSQR_CDN; s.onload = () => res(); s.onerror = () => rej(new Error('jsQR'));
    document.head.appendChild(s);
  });
}

/* Dónde quedó el QR dentro del fotograma. Se guarda SIEMPRE en pixeles del
   VIDEO (no de la pantalla): la capa 8 lo traduce a la caja de la camara.
   Si no hay lectura, se limpia y el marco verde se apaga solo. */
function marcarGeo(pts, vw, vh) {
  SCAN.geo = (pts && pts.length === 4 && vw && vh)
    ? { pts: pts, vw: vw, vh: vh, t: Date.now() }
    : null;
}

async function leerFrame(video) {
  if (!SCAN.det) return '';
  if (SCAN.det.tipo === 'nativo') {
    const codes = await SCAN.det.d.detect(video);
    const c0 = codes && codes[0];
    if (!c0 || !c0.rawValue) { marcarGeo(null); return ''; }
    let pts = null;
    if (c0.cornerPoints && c0.cornerPoints.length === 4) {
      pts = c0.cornerPoints.map(p => ({ x: p.x, y: p.y }));
    } else if (c0.boundingBox) {
      const b = c0.boundingBox;
      pts = [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y },
             { x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height }];
    }
    marcarGeo(pts, video.videoWidth, video.videoHeight);
    return String(c0.rawValue);
  }
  const c = SCAN.det.canvas;
  const w = video.videoWidth, hh = video.videoHeight;
  if (!w || !hh) { marcarGeo(null); return ''; }
  const escala = Math.min(1, 640 / Math.max(w, hh));
  c.width = Math.round(w * escala); c.height = Math.round(hh * escala);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const r = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
  if (!r || !r.data) { marcarGeo(null); return ''; }
  const L = r.location;
  let pts = null;
  if (L && L.topLeftCorner && L.bottomRightCorner) {
    pts = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner]
      .map(p => ({ x: p.x / escala, y: p.y / escala }));   // vuelta a pixeles del video
  }
  marcarGeo(pts, w, hh);
  return String(r.data);
}

async function loopScan() {
  if (!SCAN.on) return;
  const video = $('#sc-video');
  if (video && video.readyState >= 2 && !SCAN.busy) {
    try {
      if (SCAN.lote) {
        const r = await window.JPLOTE.leerVarios(video, SCAN.detLote);
        encolarLote(r.lecturas, r.vw, r.vh);
      } else {
        const raw = await leerFrame(video);
        if (raw) await procesarLectura(raw);
      }
    } catch (e) { /* un frame malo no puede tumbar el escáner */ }
  }
  if (SCAN.lote) tickLote();
  SCAN.raf = requestAnimationFrame(loopScan);
}

/* El QR de la app pública lleva SOLO el ID_USUARIO (JP + 8). Se acepta
   igual si viniera envuelto en una URL, y se acepta un documento suelto
   por si alguien pega otro tipo de código. */
function interpretar(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/JP[A-Z0-9]{8}/i);
  if (m) return { id: m[0].toUpperCase() };
  const d = onlyDig(s);
  if (/^\d{6,10}$/.test(d)) return { documento: d };
  return null;
}

async function procesarLectura(raw) {
  const p = interpretar(raw);
  const clave = p ? (p.id || p.documento) : NO_HAY + raw;
  const ahora = Date.now();
  const ult = SCAN.vistos.get(clave) || 0;
  if (ahora - ult < COOLDOWN_MS) return;   // el mismo código sigue delante de la cámara
  SCAN.vistos.set(clave, ahora);
  if (SCAN.vistos.size > 400) SCAN.vistos.clear();

  if (!p) { sonar('err'); vibrar(200); resultado('err', 'QR no reconocido', 'Ese código no es de la app de Jhonny Perdomo.'); return; }
  await registrar(p);
}

/* ---------- El registro (lo mismo para QR y para documento) ---------- */
async function registrar(p) {
  if (SCAN.busy) return null;
  SCAN.busy = true;
  try {
    const d = await api('voto.registrar', p, { silencio: true });
    if (d.noEncontrado) {
      sonar('err'); vibrar([120, 60, 120]);
      resultado('err', 'NO ESTÁ EN LA BASE DE DATOS', 'Toma los datos a mano y regístralo después.');
      return d;
    }
    if (d.yaVoto) {
      sonar('info'); vibrar(80);
      resultado('warn', 'EL VOTO YA FUE REGISTRADO ANTERIORMENTE', nombreYPuesto(d.persona));
      return d;
    }
    SCAN.total++;
    const c = $('#sc-cnt'); if (c) c.textContent = String(SCAN.total);
    sonar('ok'); vibrar(60);
    resultado('ok', 'VOTO REGISTRADO', nombreYPuesto(d.persona));
    return d;
  } catch (e) {
    sonar('err'); vibrar(200);
    resultado('err', 'No se pudo registrar', String(e.message || e) + ' · Revisa la conexión.');
    return null;
  } finally { SCAN.busy = false; }
}

/* ============================================================
   MODO LOTE — varios QR en el mismo fotograma
   ============================================================
   Uno a uno (lo de siempre): una lectura → una llamada → un resultado.
   Lote: se leen TODAS las tarjetas del cuadro, los ID entran a una cola
   y se mandan solos en tandas (votos). No hay botón de confirmar:
   el operador solo barre y mira la lista.

   El cooldown de 5 s NO aplica aquí: la cola ya recuerda lo enviado, así
   que la misma tarjeta delante de la cámara no viaja dos veces.
   ============================================================ */

function colaLote() {
  if (!SCAN.cola) SCAN.cola = new window.JPLOTE.Cola();
  return SCAN.cola;
}

/* ---------- Cambio de modo (reinicia la cámara: cambia la resolución) ---------- */
async function cambiarModo(aLote) {
  if (SCAN.lote === !!aLote) return;
  if (aLote && !window.JPLOTE) {
    resultado('err', 'Modo lote no disponible', 'Falta lote-lector.js en esta versión de la app.');
    return;
  }
  const estaba = SCAN.on;
  if (estaba) scanStop();
  SCAN.lote = !!aLote;
  SCAN.detLote = null;
  pintarModo();
  pintarPanelLote();
  if (!SCAN.lote) {
    resultado('idle', 'Modo uno a uno', 'Cada lectura se registra al instante.');
  } else {
    resultado('idle', 'Modo lote', 'Apunta a varias tarjetas juntas, a unos 30 cm.');
  }
  if (estaba) await scanStart();
}

function pintarModo() {
  const cont = $('#sc-modo'); if (!cont) return;
  $$('#sc-modo button').forEach(b => b.classList.toggle('on', (b.dataset.m === 'lote') === !!SCAN.lote));
}

function pintarPanelLote() {
  const pan = $('#sc-lote'); if (!pan) return;
  pan.classList.toggle('hidden', !SCAN.lote);
  const doc = $('#sc-doc'); if (doc) doc.classList.toggle('hidden', !!SCAN.lote);
  pintarListaLote();
  pintarCintaLote();
}

/* ---------- Lo que se ve en el cuadro entra a la cola ---------- */
function encolarLote(lecturas, vw, vh) {
  const geos = [];
  const ahora = Date.now();
  (lecturas || []).forEach(lec => {
    const p = interpretar(lec.raw);
    const id = p && p.id ? p.id : '';
    let kind = 'ok';
    if (!id) kind = 'err';                       // no es un QR de la app
    else if (colaLote().enviados[id]) kind = 'ya';   // ya viajó en esta jornada
    if (lec.pts && lec.pts.length === 4) geos.push({ pts: lec.pts, vw: vw, vh: vh, t: ahora, kind: kind });
    if (!id) return;
    if (colaLote().nuevo(id)) agregarItemLote(id);
  });
  SCAN.geos = geos.length ? geos : null;
  SCAN.geo = geos.length ? geos[0] : null;       // la capa 8 vieja sigue funcionando
  if (!geos.length) return;
}

/* ---------- Reloj de la cola: manda por tandas ---------- */
function tickLote() {
  if (SCAN.enviando) return;
  const n = colaLote().tamano();
  if (!n) return;
  if (n >= LOTE_ENVIO || (Date.now() - SCAN.ultEnvio) >= LOTE_MS) flushLote();
}

async function flushLote() {
  if (SCAN.enviando) return;
  const ids = colaLote().tomar(LOTE_ENVIO);
  if (!ids.length) return;
  SCAN.enviando = true;
  SCAN.ultEnvio = Date.now();
  pintarCintaLote();
  try {
    const d = await api('voto.registrarLote', { ids: ids.join(',') }, { silencio: true });
    aplicarLote(d.items || []);
  } catch (e) {
    colaLote().devolver(ids);
    ids.forEach(id => marcarItemLote(id, 'esperando', null, 'Sin conexión · se reintenta'));
    sonar('err'); vibrar(200);
    resultado('err', 'No se pudo registrar la tanda', String(e.message || e) + ' · Se reintenta solo.');
  } finally {
    SCAN.enviando = false;
    SCAN.ultEnvio = Date.now();
    pintarCintaLote();
  }
}

/* ---------- Respuesta del servidor sobre la lista ---------- */
function aplicarLote(items) {
  let nOk = 0, nYa = 0, nMal = 0, ultimo = '';
  items.forEach(it => {
    const id = String(it.id || '');
    const nombre = String(it.nombre || '').trim();
    const extra = String(it.puesto || '').trim();
    if (it.estado === 'ok') {
      nOk++; ultimo = nombre || id;
      colaLote().marcar(id, 'ok');
      marcarItemLote(id, 'ok', nombre, extra);
    } else if (it.estado === 'ya' || it.estado === 'repetido') {
      nYa++;
      colaLote().marcar(id, 'ya');
      marcarItemLote(id, 'ya', nombre, 'Ya estaba registrado');
    } else if (it.estado === 'sobra') {
      colaLote().devolver([id]);
      marcarItemLote(id, 'esperando', null, 'En cola');
    } else {
      nMal++;
      colaLote().marcar(id, 'malo');
      marcarItemLote(id, 'malo', null, 'No está en la base de datos');
    }
  });

  if (nOk) {
    SCAN.total += nOk;
    const c = $('#sc-cnt'); if (c) c.textContent = String(SCAN.total);
    sonar('ok'); vibrar(60);
    resultado('ok', nOk === 1 ? 'VOTO REGISTRADO' : (nOk + ' VOTOS REGISTRADOS'),
      [ultimo, (nYa ? nYa + ' ya estaba(n)' : ''), (nMal ? nMal + ' sin base' : '')].filter(Boolean).join(' · '));
  } else if (nYa) {
    sonar('info'); vibrar(80);
    resultado('warn', nYa === 1 ? 'YA ESTABA REGISTRADA' : (nYa + ' YA ESTABAN REGISTRADAS'),
      nMal ? (nMal + ' no está(n) en la base de datos') : 'No se agregó ninguna fila nueva.');
  } else if (nMal) {
    sonar('err'); vibrar(200);
    resultado('err', nMal === 1 ? 'NO ESTÁ EN LA BASE DE DATOS' : (nMal + ' NO ESTÁN EN LA BASE DE DATOS'),
      'Tómalos a mano y regístralos después.');
  }
  pintarCintaLote();
}

/* ---------- La lista viva ---------- */
function agregarItemLote(id) {
  SCAN.lista.unshift({ id: id, estado: 'esperando', nombre: '', sub: 'Leído · enviando…' });
  if (SCAN.lista.length > LOTE_LISTA) SCAN.lista.length = LOTE_LISTA;
  pintarListaLote();
  pintarCintaLote();
}

function marcarItemLote(id, estado, nombre, sub) {
  const it = SCAN.lista.find(x => x.id === id);
  if (!it) return;
  it.estado = estado;
  if (nombre) it.nombre = nombre;
  if (sub != null) it.sub = sub;
  pintarListaLote();
}

const LOTE_ICO = { esperando: '⏳', ok: '✅', ya: '⚠️', malo: '⛔' };

function pintarListaLote() {
  const cont = $('#lote-lista'); if (!cont) return;
  if (!SCAN.lista.length) {
    cont.innerHTML = '<div class="lote-vacia">Todavía no has leído ninguna tarjeta en este lote.</div>';
    return;
  }
  cont.innerHTML = SCAN.lista.map(it => `
    <div class="lote-it ${esc(it.estado)}">
      <div class="lote-ico">${LOTE_ICO[it.estado] || '⏳'}</div>
      <div class="lote-txt">
        <div class="lote-n">${esc(it.nombre || it.id)}</div>
        <div class="lote-s">${esc(it.sub || '')}</div>
      </div>
    </div>`).join('');
}

function pintarCintaLote() {
  const msg = $('#lote-msg'), pend = $('#lote-pend'), cinta = $('#lote-cinta');
  if (!msg || !pend || !cinta) return;
  const n = SCAN.cola ? SCAN.cola.tamano() : 0;   /* si aún no hay cola, no se inventa */
  cinta.classList.toggle('enviando', !!SCAN.enviando);
  msg.textContent = SCAN.enviando ? 'Registrando la tanda…'
    : (SCAN.on ? 'Apunta a varias tarjetas juntas, a unos 30 cm.' : 'Activa el escaneo para empezar el lote.');
  pend.textContent = n ? (n + ' en cola') : '';
}

function nombreYPuesto(per) {
  if (!per) return '';
  const n = String(per.nombre || '').trim();
  const pu = String(per.puesto || '').trim();
  const me = String(per.mesa == null ? '' : per.mesa).trim();
  const dd = pu ? (pu + (me ? ' · Mesa ' + me : '')) : '';
  return [n, dd].filter(Boolean).join(' — ');
}

/* ============================================================
   AYUDA: REGISTRAR CON DOCUMENTO
   Por si el QR no está a mano (certificado electoral en la mano).
   ============================================================ */
function sheetDocumento() {
  const escaneando = SCAN.on;
  if (escaneando) SCAN.busy = true; // la cámara sigue viva pero no dispara mientras se teclea

  const sh = openSheet(`
    <div class="grip"></div>
    <h2 class="h2" style="margin-bottom:4px;">Registrar con documento</h2>
    <p class="small muted" style="margin-bottom:14px;">Número del documento, sin puntos ni espacios (6 a 10 dígitos).</p>
    <label class="field"><span>Documento</span>
      <input class="input" id="dc-doc" type="tel" inputmode="numeric" autocomplete="off" placeholder="Ej: 1110234567" />
    </label>
    <div class="stack" style="margin-top:16px;">
      <button class="btn btn-primary btn-block" id="dc-ok">Registrar voto</button>
      <button class="btn btn-quiet btn-block" id="dc-no">Cancelar</button>
    </div>`);

  const inp = $('#dc-doc', sh);
  inp.addEventListener('input', () => { inp.value = onlyDig(inp.value); });
  setTimeout(() => { try { inp.focus(); } catch (e) {} }, 60);

  const salir = () => { closeLayer(); if (escaneando) SCAN.busy = false; };
  $('#dc-no', sh).onclick = salir;

  const enviar = async () => {
    const doc = onlyDig(val('dc-doc'));
    if (!/^\d{6,10}$/.test(doc)) { toast('El documento debe tener de 6 a 10 dígitos', 'err'); return; }
    const b = $('#dc-ok', sh); saving(b, true);
    SCAN.busy = false;              // registrar() necesita el paso libre
    const d = await registrar({ documento: doc });
    SCAN.busy = escaneando ? true : false;
    saving(b, false);
    if (d) salir();
  };
  $('#dc-ok', sh).onclick = enviar;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); enviar(); } });
}

/* ============================================================
   ARRANQUE  (gate de instalación)
   ============================================================ */
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
async function initApp() {
  if (typeof APP_VERSION !== 'undefined' && APP_VERSION) { APP_VERSION_LOADED = String(APP_VERSION); paintVersion(APP_VERSION_LOADED); }
  checkVersion(); setInterval(checkVersion, 60000);
  const hash = location.hash || '';
  const arranqueLimpio = (hash === '' || hash === '#/' || hash.startsWith('#/escaner'));
  const yaContinuoWeb = sessionStorage.getItem('continuedWeb') === '1';
  if (!isStandalone() && !yaContinuoWeb && arranqueLimpio) { location.hash = '#/instalar'; }
  render();
}
initApp();
