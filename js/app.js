/* ============================================================
   JHONNY VOTACIÓN — app.js
   Un escáner y nada más: se activa una vez y lee QR tras QR sin
   volver a tocar la pantalla. Cada lectura registra el voto en la
   hoja VOTOS (endpoint voto.registrar del JHONNY CORE) y el tablero
   de la app privada se entera solo (Vivo.gs → canal 'votacion').
   Patrón de shell/instalar/versión: el mismo de la app pública.
   ============================================================ */

/* URL del Web App del backend JHONNY CORE (/exec) */
/* Marca de la campaña: todo esto vive en marca.js, que se carga antes
   que este archivo. Al replicar NO se toca nada de aquí. */
const API_URL    = MARCA.API_URL;
const APP_ICON   = MARCA.APP_ICON;
const APP_BANNER = MARCA.APP_BANNER;


/* Sonidos (los mismos del index de referencia de esta app) */
const SOUNDS = {
  /* 30/07/2026 · en la carpeta img/ de este repo, no en un hosting externo.
     Se piden por fetch/Web Audio y desde otro dominio eso arrastra CORS
     (capa-3-sonido.js ya lo tenía documentado); en el MISMO origen el
     problema desaparece. Ruta relativa: los sirve el mismo GitHub Pages
     que sirve la app. */
  ok:   'img/ok.mp3',
  info: 'img/info.mp3',
  err:  'img/error.mp3'
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
/* 12/10/2026 · Fase 1: el viaje lo hace red.js (pieza común del ecosistema):
   rid en escrituras, corte al cambiar de vista, cola de fondo, reintento
   seguro (solo red caída o eco de Google, y en escrituras solo con el mismo
   rid) y versión del backend. Una lectura cortada no resuelve nunca: el
   código de la vista vieja simplemente no sigue. */
async function api(action, params = {}, opts = {}) {
  if (!opts.silencio) loaderOn();
  let json;
  try { json = await RED.pedir(API_URL, action, params, { fondo: !!opts.silencio && RED.esLectura(action) }); }
  catch (e) { if (!opts.silencio) loaderOff(); if (e && e.cortado) return new Promise(() => {}); throw e; }
  if (!opts.silencio) loaderOff();
  if (!json.ok) throw new Error(json.error || 'Error del servidor');
  return json.data;
}

/* ============================================================
   PWA: INSTALACIÓN  (mismo patrón de la app pública)
   ============================================================ */
let deferredPrompt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: installed)').matches || window.navigator.standalone === true;
const isIOS = () => /(iphone|ipad|ipod)/i.test(navigator.userAgent || '');
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (location.hash === '#/instalar') updateInstallSection(); });
window.addEventListener('appinstalled', () => { justInstalled = true; deferredPrompt = null; toast('¡App instalada!', 'ok'); updateInstallSection(false); });

/* 23/07/2026 · AVISO DE INSTALACION (3 casos, pliego del usuario)
   1) No hay opcion de instalar (iPhone, o la app ya esta instalada):
      iPhone  -> "busca la opcion Compartir y posteriormente Agregar al inicio"
      PC/Andr -> "busca la App en el escritorio de tu dispositivo"
      Se muestra SOLO la linea del dispositivo detectado.
   2) Recien instalada en PC      -> "Actualiza esta vista Ctrl + R"
   3) Recien instalada en Android -> "buscala en el escritorio de tu movil"
   "Recien instalada" solo es detectable en la MISMA sesion, via el evento
   appinstalled; tras recargar no hay senal fiable y se cae al caso 1, que es
   exactamente lo pedido. */
let justInstalled = false;
const isAndroid = () => /android/i.test(navigator.userAgent || '');

function avisoInstalarTxt() {
  if (justInstalled && !isIOS()) {
    return isAndroid()
      ? 'La App se instaló en tu dispositivo, búscala en el escritorio de tu móvil.'
      : 'La App se instaló en tu dispositivo, Actualiza esta vista Ctrl + R';
  }
  return isIOS()
    ? 'Si estás desde iPhone, busca la opción Compartir y posteriormente Agregar al inicio'
    : 'Si estás desde PC o Android, busca la App en el escritorio de tu dispositivo';
}

function updateInstallSection(esperar) {
  const box = $('#install-aviso'), tx = $('#install-aviso-txt'), b = $('#btn-install');
  if (!box || !tx) return;
  const puedeInstalar = !!deferredPrompt && !justInstalled;
  if (b) b.style.display = puedeInstalar ? '' : 'none';
  if (puedeInstalar) { box.classList.add('hidden'); return; }
  /* Chrome puede tardar unos ms en disparar beforeinstallprompt: no anunciamos
     "no hay instalacion" antes de tiempo o el aviso parpadea. */
  if (esperar && !isIOS() && !justInstalled) {
    box.classList.add('hidden');
    setTimeout(() => { if (location.hash === '#/instalar') updateInstallSection(false); }, 1200);
    return;
  }
  tx.textContent = avisoInstalarTxt();
  box.classList.remove('hidden');
}

/* ============================================================
   VERSIÓN + AUTO-UPDATE  (lee version.js por texto)
   ============================================================ */
let APP_VERSION_LOADED = '', __verInFlight = false;
function paintVersion(v) { $$('.app-version-line').forEach(el => el.textContent = 'Versión ' + v); }
/* 12/10/2026 · ENTRADA INSTANTÁNEA — la app abre desde la caché de su versión
   y version.js se revisa en paralelo. Si cambió: se le avisa al service worker
   (cambia de caché) y se hace UNA sola recarga (candado por versión en la
   sesión, así nunca queda en bucle). Sin SW activo, se limpian las cachés. */
async function recargarVersion(v) {
  try { const k = nsKey('jp_recarga_' + v); if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch (e) {}
  try {
    const c = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (c) await new Promise(res => { const ch = new MessageChannel(); ch.port1.onmessage = () => res(); c.postMessage({ tipo: 'version', v: v }, [ch.port2]); setTimeout(res, 1500); });
    else { const ks = await caches.keys(); await Promise.all(ks.filter(nsCacheMia).map(k => caches.delete(k))); }
  } catch (e) {}
  location.reload();
}
async function checkVersion() {
  if (__verInFlight) return; __verInFlight = true;
  try {
    const r = await fetch('./js/version.js?t=' + Date.now(), { cache: 'no-store' });
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
      return recargarVersion(v);
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
  RED.nuevaVista();   /* 12/10/2026 · corta lecturas de la vista que se va */
  const route = (location.hash.replace(/^#\//, '') || '').split('?')[0];
  if (route !== 'escaner') scanStop(); // salir de la vista apaga la cámara
  /* 23/07/2026 · Si la app YA corre instalada (ventana standalone), la vista
     Instalar no tiene sentido y ademas dejaba la ventana muerta: Chrome abre la
     PWA en la misma URL desde la que se instalo, y si esa URL traia #/instalar,
     Ctrl+R la mantenia ahi para siempre. Se limpia el hash SIN dejar rastro en el
     historial (replaceState no dispara hashchange, por eso se repinta a mano). */
  if (route === 'instalar' && isStandalone()) { history.replaceState(null, '', location.pathname + location.search + '#/'); return render(); }
  if (route === 'instalar') return viewInstalar();
  return viewEscaner();
}

/* ============================================================
   VISTA INSTALAR  (gate)
   ============================================================ */
function viewInstalar() {
  app.innerHTML = `
    <div class="login-wrap"><div class="login-card">
      <img class="login-logo" src="${APP_ICON}" alt="${esc(MV.candidato)}" />
      <h1 class="login-title">Registro de Votación</h1>
      <p class="login-sub">Instala la aplicación: la cámara del escáner funciona mucho mejor como app instalada que dentro del navegador.</p>

      <div id="install-box" style="margin-top:16px;">
        <button id="btn-install" class="btn btn-primary btn-block" style="display:none;">📲 Instalar aplicación</button>
        <div id="install-aviso" class="hidden ios-steps-wrap">
          <p class="small" id="install-aviso-txt" style="text-align:left;color:var(--muted);"></p>
        </div>
        <button id="btn-cont-web" class="btn btn-ghost btn-block" style="margin-top:10px;">🌐 Continuar en el navegador</button>
      </div>

      ${footBrand()}
    </div></div>`;
  app.hidden = false; hideSplash(); paintVersion(APP_VERSION_LOADED || (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''));
  updateInstallSection(true);
  const cont = () => { sessionStorage.setItem(nsKey('continuedWeb'), '1'); go('escaner'); };
  const bi = $('#btn-install');
  if (bi) bi.onclick = async () => {
    if (!deferredPrompt) { toast('La instalación aún no está disponible. Usa el menú del navegador.'); return; }
    const dp = deferredPrompt; dp.prompt(); try { await dp.userChoice; } catch (e) {} deferredPrompt = null; updateInstallSection();
  };
  const cw = $('#btn-cont-web'); if (cw) cw.onclick = cont;
}

/* ============================================================
   VISTA ESCÁNER
   ============================================================ */
function viewEscaner() {
  app.innerHTML = `
    <div class="appbar">
      <img class="mark-img" src="${APP_ICON}" alt="" />
      <div class="who"><b>Registro de Votación</b><span>${esc(MV.candidato)}</span></div>
      <button type="button" class="cnt-vivo" id="sc-vivo" title="Votos registrados en total · toca para ver el rendimiento">
        <span class="cv-n" id="sc-total">—</span>
        <span class="cv-l"><i class="cv-dot"></i><span id="sc-total-l">EN VIVO</span></span>
      </button>
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
        <button type="button" data-m="lote">En bloque · ráfaga</button>
      </div>

      <div id="sc-res" class="res res-idle">
        <div class="res-t" id="sc-res-t">Listo para escanear</div>
        <div class="res-s" id="sc-res-s">Cada lectura queda guardada en este equipo y se registra sola.</div>
      </div>

      <div class="lote-cinta" id="lote-cinta">
        <span id="lote-msg">Este equipo: <b id="sc-cnt">0</b> registrados hoy</span>
        <span class="lote-pend" id="lote-pend"></span>
      </div>
      <div class="lote-lista" id="lote-lista"></div>

      <button id="sc-toggle" class="btn btn-primary btn-block">▶️ Activar escaneo</button>
      <button id="sc-doc" class="btn btn-ghost btn-block">🆘 Ayuda: registrar con DOCUMENTO</button>

      ${footBrand()}
    </div>`;
  app.hidden = false; hideSplash();
  paintVersion(APP_VERSION_LOADED || (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''));
  $('#sc-toggle').onclick = () => (SCAN.on ? scanStop() : scanStart());
  $('#sc-doc').onclick = sheetDocumento;
  $('#sc-vivo').onclick = sheetRendimiento;
  $$('#sc-modo button').forEach(b => { b.onclick = () => cambiarModo(b.dataset.m === 'lote'); });
  pintarToggle();
  pintarModo();
  pintarLista();
  pintarCinta();
  pintarVivo();
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
   MOTOR DE ESCANEO  (12/10/2026 · Fase 3)
   Se activa UNA vez y sigue leyendo. La cámara nunca espera al
   servidor: cada lectura entra a la cola guardada (escaneo-cola.js)
   y la confirmación llega sola. Uno a uno: cada QR viaja al instante.
   En bloque: las lecturas se juntan y viajan en un solo viaje.
   ============================================================ */
const SCAN = { on: false, stream: null, det: null, raf: null, pausa: false, vistos: new Map(), geo: null,
  lote: false, detLote: null, geos: null, lista: [], ultDec: 0, ultFrame: 0, ultTiempo: -1, reinicios: 0 };
/* 12/10/2026 · red.js no recarga por versión nueva con el escáner encendido */
window.RED_NO_RECARGAR = () => SCAN.on;
const COOLDOWN_MS = 5000;      // el mismo QR delante de la cámara no se relee en 5 s
const NO_HAY = 'NO_HAY';
const LISTA_MAX = 40;
const DEC_MS = { uno: 80, lote: 140 };   // cada cuánto se analiza un cuadro (ahorra batería)
const VENDOR = { jsqr: 'js/vendor/jsQR.js' };

/* ---------- La cola (escaneo-cola.js) ---------- */
function colaIniciar() {
  ESC.iniciar({
    app: 'voto', api: API_URL,
    accionUno: 'voto.registrar', accionLote: 'voto.registrarLote',
    interpretar: interpretarRespuesta,
    alEstado: alEstadoCola
  });
}

/* Respuesta del CORE → una línea por persona */
function interpretarRespuesta(it, d) {
  if (it.tipo === 'lote') {
    return (d.items || []).map(x => {
      const nom = String(x.nombre || '').trim();
      if (x.estado === 'ok') return { id: x.id, e: 'ok', nom, sub: [x.puesto, x.mesa ? 'Mesa ' + x.mesa : ''].filter(Boolean).join(' · ') };
      if (x.estado === 'ya' || x.estado === 'repetido') return { id: x.id, e: 'ya', nom, sub: 'Ya estaba registrado' };
      if (x.estado === 'noFlandes') return { id: x.id, e: 'fuera', nom, sub: 'No vota en ' + MV.municipio + (x.puesto ? ' · ' + x.puesto : '') };
      if (x.estado === 'sobra') return { id: x.id, reencolar: true };
      return { id: x.id, e: 'malo', nom: '', sub: 'No está en la base de datos' };
    });
  }
  const id = it.doc ? 'DOC ' + it.doc : it.ids[0];
  if (d.noEncontrado) return [{ id, e: 'malo', nom: it.doc ? 'Documento ' + it.doc : '', sub: 'No está en la base de datos' }];
  if (d.noFlandes) return [{ id, e: 'fuera', nom: (d.persona && d.persona.nombre) || '', sub: nombreYMunicipio(d.persona, d.municipio) }];
  if (d.yaVoto) return [{ id, e: 'ya', nom: (d.persona && d.persona.nombre) || '', sub: 'El voto ya fue registrado anteriormente' }];
  return [{ id, e: 'ok', nom: (d.persona && d.persona.nombre) || '', sub: nombreYPuesto(d.persona).replace(/^[^—]*— ?/, '') }];
}

function alEstadoCola(tipo, d) {
  if (tipo === 'resultado') {
    if (d.error) {
      sonar('err'); vibrar(200);
      resultado('err', 'No se pudo registrar', d.error);
      (d.item.ids || []).forEach(id => marcarItem(id, 'malo', null, d.error));
      return;
    }
    if (d.total != null) vivoTotalRespaldo(d.total);
    const res = (d.res || []).filter(r => !r.reencolar);
    res.forEach(r => marcarItem(r.id, r.e, r.nom, r.sub));
    anunciar(res, d.item);
    pintarContador();
  }
  if (tipo === 'cola' && d.recuperadas) {
    resultado('idle', d.recuperadas === 1 ? '1 LECTURA RECUPERADA' : d.recuperadas + ' LECTURAS RECUPERADAS', 'Quedaron guardadas de antes y se están registrando.');
  }
  if (tipo === 'reintento' || tipo === 'senal') {
    (d.item ? d.item.ids : []).forEach(id => marcarItem(id, 'esperando', null, ESC.sinSenal() ? 'Sin señal · guardado, se envía solo' : 'Reintentando…'));
  }
  pintarCinta();
}

/* Sonido y panel grande: una sola vez por respuesta */
function anunciar(res, it) {
  if (!res.length) return;
  const n = k => res.filter(r => r.e === k).length;
  const ok = n('ok'), ya = n('ya'), fuera = n('fuera'), malo = n('malo');
  const ult = res[res.length - 1];
  if (it.tipo !== 'lote') {
    if (ult.e === 'ok') { sonar('ok'); vibrar(60); resultado('ok', 'VOTO REGISTRADO', [ult.nom, ult.sub].filter(Boolean).join(' — ')); }
    else if (ult.e === 'ya') { sonar('info'); vibrar(80); resultado('warn', 'EL VOTO YA FUE REGISTRADO ANTERIORMENTE', ult.nom); }
    else if (ult.e === 'fuera') { sonar('err'); vibrar([120, 60, 120]); resultado('err', 'NO VOTA EN ' + MV.municipio.toUpperCase(), ult.sub); }
    else { sonar('err'); vibrar([120, 60, 120]); resultado('err', 'NO ESTÁ EN LA BASE DE DATOS', ult.nom || 'Toma los datos a mano y regístralo después.'); }
    return;
  }
  const extra = [(ya ? ya + ' ya estaba(n)' : ''), (fuera ? fuera + ' no vota(n) en ' + MV.municipio : ''), (malo ? malo + ' sin base' : '')].filter(Boolean).join(' · ');
  if (ok) { sonar('ok'); vibrar(60); resultado('ok', ok === 1 ? 'VOTO REGISTRADO' : ok + ' VOTOS REGISTRADOS', [res.filter(r => r.e === 'ok').pop().nom, extra].filter(Boolean).join(' · ')); }
  else if (ya) { sonar('info'); vibrar(80); resultado('warn', ya === 1 ? 'YA ESTABA REGISTRADA' : ya + ' YA ESTABAN REGISTRADAS', extra); }
  else { sonar('err'); vibrar(200); resultado('err', fuera ? 'NO VOTA(N) EN ' + MV.municipio.toUpperCase() : 'NO ESTÁ(N) EN LA BASE DE DATOS', extra); }
}

/* ---------- Cámara ---------- */
async function scanStart() {
  if (SCAN.on) return;
  const video = $('#sc-video'); if (!video) return;
  try {
    /* En bloque se pide el cuadro más grande: varias tarjetas de 4 cm necesitan
       píxeles de sobra. Uno a uno se queda con 1280x720. */
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
  /* La cámara se cayó (otra app la tomó, el sistema la suspendió): se reabre sola */
  SCAN.stream.getVideoTracks().forEach(t => { t.onended = () => { if (SCAN.on) reabrirCamara('La cámara se interrumpió'); }; });
  try { await prepararDetector(); } catch (e) {
    scanStop();
    resultado('err', 'No se pudo iniciar el lector', 'Revisa la conexión y vuelve a intentarlo.');
    return;
  }
  if (SCAN.lote) {
    try { SCAN.detLote = await window.JPLOTE.preparar(SCAN.det); }
    catch (e) {
      SCAN.lote = false; SCAN.detLote = null; pintarModo();
      resultado('err', 'Modo en bloque no disponible', 'No se pudo cargar el lector múltiple. Sigues en uno a uno.');
      sonar('err');
    }
  }
  SCAN.on = true; SCAN.ultFrame = performance.now(); SCAN.ultTiempo = -1;
  pedirPantallaEncendida();
  pintarToggle();
  resultado('idle', 'Escaneando…', SCAN.lote ? 'Pasa las tarjetas seguidas o varias juntas. Se registran solas.' : 'Apunta al QR. No hay que oprimir nada entre persona y persona.');
  loopScan();
}

function scanStop() {
  if (!SCAN.on && !SCAN.stream) return;
  SCAN.on = false;
  if (SCAN.raf) { cancelAnimationFrame(SCAN.raf); SCAN.raf = null; }
  if (SCAN.stream) { SCAN.stream.getTracks().forEach(t => { try { t.onended = null; t.stop(); } catch (e) {} }); SCAN.stream = null; }
  const v = $('#sc-video'); if (v) v.srcObject = null;
  SCAN.geo = null; SCAN.geos = null;
  try { if (SCAN._wake) { SCAN._wake.release(); SCAN._wake = null; } } catch (e) {}
  if (SCAN.lote && window.ESC) ESC.sellar();   // lo leído en la última tanda sale ya
  pintarToggle();
  const box = $('#sc-res'); if (box && box.classList.contains('res-idle')) resultado('idle', 'Escáner apagado', 'Actívalo para seguir registrando.');
}

async function reabrirCamara(motivo) {
  if (SCAN.reabriendo) return;
  SCAN.reabriendo = true; SCAN.reinicios++;
  scanStop();
  resultado('idle', 'Reabriendo la cámara…', motivo || '');
  await new Promise(r => setTimeout(r, 400));
  SCAN.reabriendo = false;
  if (location.hash.indexOf('escaner') >= 0 || location.hash === '' || location.hash === '#/') scanStart();
}

async function pedirPantallaEncendida() {
  try { if ('wakeLock' in navigator && !SCAN._wake) SCAN._wake = await navigator.wakeLock.request('screen'); } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !SCAN.on) return;
  /* Al volver a la app: pantalla encendida otra vez y cámara viva, o se reabre */
  SCAN._wake = null; pedirPantallaEncendida();
  const t = SCAN.stream && SCAN.stream.getVideoTracks()[0];
  if (!t || t.readyState !== 'live' || t.muted) reabrirCamara('La cámara estaba en pausa');
});

/* BarcodeDetector nativo si el equipo lo tiene (Android/Chrome). Si no, jsQR
   servido por la misma app (queda en la caché: funciona sin señal). */
async function prepararDetector() {
  if (SCAN.det) return;
  if ('BarcodeDetector' in window) {
    try {
      const fmts = await window.BarcodeDetector.getSupportedFormats();
      if (fmts.indexOf('qr_code') >= 0) { SCAN.det = { tipo: 'nativo', d: new window.BarcodeDetector({ formats: ['qr_code'] }) }; return; }
    } catch (e) {}
  }
  await cargarScript(VENDOR.jsqr, () => window.jsQR);
  SCAN.det = { tipo: 'jsqr', canvas: document.createElement('canvas') };
}
function cargarScript(src, listo) {
  if (listo()) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error(src));
    document.head.appendChild(s);
  });
}
/* Se bajan en un rato libre para que queden en la caché antes de necesitarse */
function precargarLectores() {
  const ir = () => {
    if (!('BarcodeDetector' in window)) { fetch(VENDOR.jsqr).catch(() => {}); fetch('js/vendor/zbar.js').catch(() => {}); }
  };
  if ('requestIdleCallback' in window) requestIdleCallback(ir, { timeout: 4000 }); else setTimeout(ir, 2500);
}

function marcarGeo(pts, vw, vh) {
  SCAN.geo = (pts && pts.length === 4 && vw && vh) ? { pts: pts, vw: vw, vh: vh, t: Date.now() } : null;
}

async function leerFrame(video) {
  if (!SCAN.det) return '';
  if (SCAN.det.tipo === 'nativo') {
    const codes = await SCAN.det.d.detect(video);
    const c0 = codes && codes[0];
    if (!c0 || !c0.rawValue) { marcarGeo(null); return ''; }
    marcarGeo(window.JPLOTE ? JPLOTE.ptsNativo(c0) : null, video.videoWidth, video.videoHeight);
    return String(c0.rawValue);
  }
  const c = SCAN.det.canvas;
  const w = video.videoWidth, hh = video.videoHeight;
  if (!w || !hh) { marcarGeo(null); return ''; }
  const escala = Math.min(1, 640 / Math.max(w, hh));
  const cw = Math.round(w * escala), ch = Math.round(hh * escala);
  if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, cw, ch);
  const img = ctx.getImageData(0, 0, cw, ch);
  const r = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
  if (!r || !r.data) { marcarGeo(null); return ''; }
  const L = r.location;
  let pts = null;
  if (L && L.topLeftCorner && L.bottomRightCorner) {
    pts = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner].map(p => ({ x: p.x / escala, y: p.y / escala }));
  }
  marcarGeo(pts, w, hh);
  return String(r.data);
}

async function loopScan() {
  if (!SCAN.on) return;
  const video = $('#sc-video');
  const ahora = performance.now();
  /* Vigía: si el video deja de avanzar 3 s seguidos, la cámara se congeló */
  if (video && video.readyState >= 2) {
    if (video.currentTime !== SCAN.ultTiempo) { SCAN.ultTiempo = video.currentTime; SCAN.ultFrame = ahora; }
    else if (ahora - SCAN.ultFrame > 3000) { reabrirCamara('La imagen se congeló'); return; }
  }
  if (video && video.readyState >= 2 && !SCAN.pausa && ahora - SCAN.ultDec >= DEC_MS[SCAN.lote ? 'lote' : 'uno']) {
    SCAN.ultDec = ahora;
    try {
      const t0 = performance.now();
      if (SCAN.lote) {
        const r = await window.JPLOTE.leerVarios(video, SCAN.detLote);
        ESC.decodMs(performance.now() - t0);
        encolarLote(r.lecturas, r.vw, r.vh);
      } else {
        const raw = await leerFrame(video);
        ESC.decodMs(performance.now() - t0);
        if (raw) procesarLectura(raw);
      }
    } catch (e) { /* un cuadro malo no puede tumbar el escáner */ }
  }
  if (SCAN.on) SCAN.raf = requestAnimationFrame(loopScan);
}

/* El QR de la app pública lleva SOLO el ID_USUARIO (JP + 8). Se acepta
   igual si viniera envuelto en una URL, y un documento suelto. */
function interpretar(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/JP[A-Z0-9]{8}/i);
  if (m) return { id: m[0].toUpperCase() };
  const d = onlyDig(s);
  if (/^\d{6,10}$/.test(d)) return { documento: d };
  return null;
}

/* ---------- Uno a uno ---------- */
function procesarLectura(raw) {
  const p = interpretar(raw);
  const clave = p ? (p.id || p.documento) : NO_HAY + raw;
  const ahora = Date.now();
  if (ahora - (SCAN.vistos.get(clave) || 0) < COOLDOWN_MS) return;   // sigue delante de la cámara
  SCAN.vistos.set(clave, ahora);
  if (SCAN.vistos.size > 400) SCAN.vistos.clear();

  if (!p) { sonar('err'); vibrar(200); resultado('err', 'QR no reconocido', `Ese código no es de la app de ${MV.candidato}.`); return; }
  if (p.documento) { ESC.documento(p.documento); agregarItem('DOC ' + p.documento, 'Documento ' + p.documento); return; }
  const r = ESC.leer(p.id);
  if (r.estado === 'hecho') { avisarHecho(p.id, r.hecho); return; }
  if (r.estado === 'enCola') { resultado('idle', 'YA ESTÁ EN COLA', 'Esa tarjeta ya se leyó y se está registrando.'); return; }
  vibrar(30);
  agregarItem(p.id);
  resultado('idle', 'LEÍDO · REGISTRANDO…', ESC.sinSenal() ? 'Sin señal: queda guardado y se envía solo.' : 'Puedes pasar a la siguiente persona.');
}

/* Ya registrado en ESTE equipo hoy: se contesta sin viajar */
function avisarHecho(id, h) {
  if (h.e === 'ok' || h.e === 'ya') { sonar('info'); vibrar(80); resultado('warn', 'EL VOTO YA FUE REGISTRADO ANTERIORMENTE', h.nom || id); }
  else if (h.e === 'fuera') { sonar('err'); vibrar([120, 60, 120]); resultado('err', 'NO VOTA EN ' + MV.municipio.toUpperCase(), h.sub || h.nom); }
}

/* ---------- En bloque ---------- */
function encolarLote(lecturas, vw, vh) {
  const geos = [], ahora = Date.now();
  (lecturas || []).forEach(lec => {
    const p = interpretar(lec.raw);
    const id = p && p.id ? p.id : '';
    let kind = 'ok';
    if (!id) kind = 'err';
    else if (ESC.hecho(id)) kind = 'ya';
    if (lec.pts && lec.pts.length === 4) geos.push({ pts: lec.pts, vw: vw, vh: vh, t: ahora, kind: kind });
    if (!id) return;
    const r = ESC.leerLote(id);
    if (r.estado === 'nuevo') { vibrar(20); agregarItem(id); }
  });
  SCAN.geos = geos.length ? geos : null;
  SCAN.geo = geos.length ? geos[0] : null;
}

/* ---------- Cambio de modo (reinicia la cámara: cambia la resolución) ---------- */
async function cambiarModo(aLote) {
  if (SCAN.lote === !!aLote) return;
  if (aLote && !window.JPLOTE) { resultado('err', 'Modo en bloque no disponible', 'Falta lote-lector.js en esta versión de la app.'); return; }
  const estaba = SCAN.on;
  if (estaba) scanStop();
  SCAN.lote = !!aLote; SCAN.detLote = null;
  try { localStorage.setItem(nsKey('esc_modo'), SCAN.lote ? 'lote' : 'uno'); } catch (e) {}
  pintarModo();
  resultado('idle', SCAN.lote ? 'Modo en bloque' : 'Modo uno a uno', SCAN.lote ? 'Pasa las tarjetas seguidas (o varias juntas, a unos 30 cm). Viajan en tandas.' : 'Cada lectura se registra al instante.');
  if (estaba) await scanStart();
}
function pintarModo() {
  $$('#sc-modo button').forEach(b => b.classList.toggle('on', (b.dataset.m === 'lote') === !!SCAN.lote));
}

/* ---------- Lista de lecturas (los dos modos) ---------- */
function agregarItem(id, nom) {
  SCAN.lista = SCAN.lista.filter(x => x.id !== id);
  SCAN.lista.unshift({ id: id, estado: 'esperando', nombre: nom || '', sub: ESC.sinSenal() ? 'Sin señal · guardado, se envía solo' : 'Leído · registrando…' });
  if (SCAN.lista.length > LISTA_MAX) SCAN.lista.length = LISTA_MAX;
  pintarLista(); pintarCinta();
}
function marcarItem(id, estado, nombre, sub) {
  let it = SCAN.lista.find(x => x.id === id);
  if (!it) { if (estado === 'esperando') return; agregarItem(id); it = SCAN.lista[0]; }
  it.estado = estado;
  if (nombre) it.nombre = nombre;
  if (sub != null) it.sub = sub;
  pintarLista();
}
const LISTA_ICO = { esperando: '⏳', ok: '✅', ya: '⚠️', fuera: '⛔', malo: '⛔' };
let _pintarListaPend = false;
function pintarLista() {
  if (_pintarListaPend) return;
  _pintarListaPend = true;
  requestAnimationFrame(() => {
    _pintarListaPend = false;
    const cont = $('#lote-lista'); if (!cont) return;
    if (!SCAN.lista.length) { cont.innerHTML = '<div class="lote-vacia">Aquí aparece cada persona leída y si quedó registrada.</div>'; return; }
    cont.innerHTML = SCAN.lista.map(it => `
      <div class="lote-it ${esc(it.estado === 'fuera' ? 'malo' : it.estado)}">
        <div class="lote-ico">${LISTA_ICO[it.estado] || '⏳'}</div>
        <div class="lote-txt">
          <div class="lote-n">${esc(it.nombre || it.id)}</div>
          <div class="lote-s">${esc(it.sub || '')}</div>
        </div>
      </div>`).join('');
  });
}
function pintarCinta() {
  const pend = $('#lote-pend'), cinta = $('#lote-cinta');
  if (!pend || !cinta || !window.ESC) return;
  const n = ESC.pendientes(), sin = ESC.sinSenal();
  cinta.classList.toggle('enviando', n > 0 && !sin);
  cinta.classList.toggle('sin-senal', sin);
  pend.textContent = sin ? ('📶 Sin señal · ' + n + ' guardada' + (n === 1 ? '' : 's')) : (n ? n + ' por confirmar' : '');
  pintarContador();
}
function pintarContador() {
  const c = $('#sc-cnt'); if (c && window.ESC) c.textContent = String(ESC.totalHechos('ok'));
}

/* ============================================================
   EN VIVO: total de votos desde Firebase (/votacion/total)
   Lo escribe SOLO el CORE (las reglas lo dejan en solo lectura). Se escucha
   con EventSource (sin SDK): un único canal abierto, sin relojes. Si
   Firebase no responde, el total se toma de cada respuesta del CORE.
   ============================================================ */
const VIVO = { es: null, total: null, vivo: false };
function vivoConectar() {
  const base = (window.MARCA && MARCA.FB_RTDB) || '';
  if (!base || !('EventSource' in window) || VIVO.es) return;
  try {
    const es = new EventSource(base.replace(/\/+$/, '') + '/votacion/total.json');
    VIVO.es = es;
    const tomar = (ev) => {
      try { const j = JSON.parse(ev.data); if (j && j.path === '/') { VIVO.total = (typeof j.data === 'number') ? j.data : 0; VIVO.vivo = true; pintarVivo(); } } catch (e) {}
    };
    es.addEventListener('put', tomar);
    es.addEventListener('patch', tomar);
    es.addEventListener('cancel', () => { VIVO.vivo = false; pintarVivo(); });
    es.onerror = () => { VIVO.vivo = false; pintarVivo(); };
  } catch (e) {}
}
function vivoTotalRespaldo(t) { if (!VIVO.vivo && typeof t === 'number') { VIVO.total = t; pintarVivo(); } }
function pintarVivo() {
  const n = $('#sc-total'), l = $('#sc-total-l'), b = $('#sc-vivo');
  if (!n) return;
  n.textContent = VIVO.total == null ? '—' : Number(VIVO.total).toLocaleString('es-CO');
  if (l) l.textContent = VIVO.vivo ? 'EN VIVO' : 'TOTAL';
  if (b) b.classList.toggle('vivo', !!VIVO.vivo);
}

/* ---------- Rendimiento (regla 15): toca el total ---------- */
function sheetRendimiento() {
  const m = ESC.medidas(), r = RED.medidas().slice(-12);
  const fila = (a, b) => `<tr><td>${esc(a)}</td><td style="text-align:right;"><b>${esc(b == null ? '—' : b)}</b></td></tr>`;
  openSheet(`
    <div class="grip"></div>
    <h2 class="h2" style="margin-bottom:8px;">Rendimiento de este equipo</h2>
    <table class="rend">${[
      fila('Lectura de cámara p50 / p95', (m.decodP50 ?? '—') + ' / ' + (m.decodP95 ?? '—') + ' ms'),
      fila('Leído → confirmado p50 / p95', (m.leerAConfirmarP50 ?? '—') + ' / ' + (m.leerAConfirmarP95 ?? '—') + ' ms'),
      fila('Envío al servidor p50 / p95', (m.envioP50 ?? '—') + ' / ' + (m.envioP95 ?? '—') + ' ms'),
      fila('Envíos · reintentos', m.envios + ' · ' + m.reintentos),
      fila('Respuesta más pesada', m.kbMax + ' KB'),
      fila('Pendientes en cola', ESC.pendientes()),
      fila('Cámara reabierta sola', SCAN.reinicios),
      fila('Total en vivo', VIVO.vivo ? 'conectado' : 'sin Firebase')
    ].join('')}</table>
    <p class="small muted" style="margin-top:10px;">Últimos viajes: ${r.map(x => esc(x.a.replace(/^voto\./, '')) + ' ' + x.ms + ' ms').join(' · ') || '—'}</p>
    <div class="stack" style="margin-top:14px;"><button class="btn btn-quiet btn-block" id="rd-ok">Cerrar</button></div>`);
  $('#rd-ok').onclick = closeLayer;
}

/* 25/07: nombre + lo que dice la columna MUNICIPIO, para el aviso de
   "No vota en Flandes". Si viene vacía se dice tal cual. */
function nombreYMunicipio(per, municipio) {
  const n = String((per && per.nombre) || '').trim();
  const m = String(municipio || (per && per.municipio) || '').trim();
  return [n, m ? 'Municipio: ' + m : 'Sin municipio registrado'].filter(Boolean).join(' — ');
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
   Por si el QR no está a mano. Entra a la misma cola: no se pierde sin
   señal y el resultado aparece en la lista.
   ============================================================ */
function sheetDocumento() {
  SCAN.pausa = true;   // la cámara sigue viva pero no lee mientras se teclea
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
  const salir = () => { closeLayer(); SCAN.pausa = false; };
  $('#dc-no', sh).onclick = salir;
  let enviado = false;
  const enviar = () => {
    if (enviado) return;
    const doc = onlyDig(val('dc-doc'));
    if (!/^\d{6,10}$/.test(doc)) { toast('El documento debe tener de 6 a 10 dígitos', 'err'); return; }
    enviado = true;
    ESC.documento(doc);
    agregarItem('DOC ' + doc, 'Documento ' + doc);
    resultado('idle', 'DOCUMENTO EN COLA', 'Se registra solo; el resultado aparece en la lista.');
    salir();
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
  const yaContinuoWeb = sessionStorage.getItem(nsKey('continuedWeb')) === '1';
  if (!isStandalone() && !yaContinuoWeb && arranqueLimpio) { location.hash = '#/instalar'; }
  /* 12/10/2026 · Fase 3: cola guardada (lo pendiente de antes sale solo),
     modo recordado, total EN VIVO y lectores precargados para usar sin señal */
  try { SCAN.lote = localStorage.getItem(nsKey('esc_modo')) === 'lote' && !!window.JPLOTE; } catch (e) {}
  colaIniciar();
  vivoConectar();
  precargarLectores();
  render();
}
initApp();
