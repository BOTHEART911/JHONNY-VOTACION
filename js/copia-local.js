/* ============================================================================
 * copia-local.js — COPIA LOCAL PARA ESCANEAR SIN SEÑAL (08/11/2026)
 * ----------------------------------------------------------------------------
 * Pieza IDÉNTICA en JHONNY-VOTACION y JHONNY-ASISTENCIAS. Sin DOM.
 *
 *  · "Prepararme sin señal": con la CLAVE DEL ESCÁNER se baja UNA vez la copia
 *    (ruta esc.copia del CORE, POST, comprimida ~100 KB). Queda en el teléfono.
 *  · La copia NO trae cédulas ni IDs de QR en claro: trae huellas (cyrb53 con
 *    la sal de la campaña). Aquí se calcula la huella de lo que se lee y se
 *    busca: nombre, puesto, mesa, si vota en el municipio y residencia.
 *  · Se renueva sola al abrir la app con señal si tiene más de 30 min, sin
 *    reloj. Se borra sola a los 7 días sin renovarse, o con "Borrar copia".
 *  · Es solo para avisar al instante: lo que se registra lo decide SIEMPRE el
 *    CORE al subir (rid fijo, duplicados bajo candado).
 * ============================================================================ */
(function (raiz) {
  'use strict';
  if (raiz.COPIA) return;

  var VIEJA_MS = 30 * 60 * 1000, VENCE_MS = 7 * 24 * 3600 * 1000;
  var C = null, datos = null, mapa = null, cargando = null, oyentes = [];

  function ns(k) { return (typeof raiz.nsKey === 'function') ? raiz.nsKey(k) : 'jp:' + k; }
  function kCopia() { return ns('esc_copia_v1'); }
  function kClave() { return ns('esc_clave'); }
  function avisar() { oyentes.forEach(function (f) { try { f(estado()); } catch (e) {} }); }

  /* Misma función que esrH_ en Escaneo_SinRed.gs (no cambiar una sin la otra) */
  function huella(s, sal) {
    var str = String(sal) + '|' + String(s), h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    var n = (255 & h2) * 4294967296 + (h1 >>> 0), A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', o = '';
    for (var k = 0; k < 7; k++) { o = A.charAt(n % 64) + o; n = Math.floor(n / 64); }
    return o;
  }

  async function abrirGz(b64) {
    var bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    var ds = new DecompressionStream('gzip');
    var txt = await new Response(new Blob([u]).stream().pipeThrough(ds)).text();
    return JSON.parse(txt);
  }

  function armar(obj) {
    var m = new Map();
    (obj.f || []).forEach(function (f) { if (f[0]) m.set(f[0], f); if (f[1]) m.set(f[1], f); });
    datos = obj; mapa = m;
  }

  /* Lo guardado se abre UNA vez por sesión (async, ~10–30 ms) */
  function cargar() {
    if (cargando) return cargando;
    cargando = (async function () {
      var g = null;
      try { g = JSON.parse(localStorage.getItem(kCopia()) || 'null'); } catch (e) {}
      if (!g || !(g.gz || g.j) || !g.ts) return null;
      if (Date.now() - g.ts > VENCE_MS) { borrar(); return null; }
      try { var obj = g.gz ? await abrirGz(g.gz) : JSON.parse(g.j); obj.__ts = g.ts; armar(obj); } catch (e) { datos = null; mapa = null; }
      avisar();
      return datos;
    })();
    return cargando;
  }

  function persona(f) {
    if (!f) return null;
    return { nombre: f[2] || '', puesto: (datos.p || [])[f[3]] || '', mesa: f[4] || '', mio: f[5] === 1, residencia: (datos.r || [])[f[6]] || '' };
  }
  /* undefined = no hay copia (no se puede decir nada); null = no está en la copia */
  function buscarQr(id) { if (!mapa) return undefined; return persona(mapa.get(huella('Q' + String(id).trim().toUpperCase(), datos.sal))); }
  function buscarDoc(doc) { if (!mapa) return undefined; return persona(mapa.get(huella('D' + String(doc).replace(/\D/g, ''), datos.sal))); }

  function estado() {
    var ts = datos ? datos.__ts : 0;
    return { hay: !!mapa, n: datos ? (datos.n || 0) : 0, ts: ts, edad: ts ? Date.now() - ts : 0, clave: !!clave(), municipio: datos ? datos.mun : '' };
  }
  function clave() { try { return localStorage.getItem(kClave()) || ''; } catch (e) { return ''; } }

  /* Baja la copia. Sin clave guardada pide la que se le pase. */
  async function preparar(claveDada, opts) {
    opts = opts || {};
    var cl = String(claveDada || clave() || '').trim();
    if (!cl) { var e0 = new Error('Escribe la clave del escáner'); e0.sinClave = true; throw e0; }
    var t0 = performance.now();
    var json = await RED.pedir(C.api, 'esc.copia', {}, { metodo: 'POST', cuerpo: { clave: cl }, fondo: !!opts.fondo, persistente: true });
    if (!json.ok) throw new Error(json.error || 'Error del servidor');
    var d = json.data || {};
    if (d.ok === false) {
      if (d.claveMala) { try { localStorage.removeItem(kClave()); } catch (e) {} }
      var e1 = new Error(d.msg || 'No se pudo preparar la copia'); e1.claveMala = !!d.claveMala; throw e1;
    }
    var gz = d.gz || null, obj;
    if (gz) obj = await abrirGz(gz);
    else { obj = d; }
    var ts = Date.now();
    try {
      localStorage.setItem(kCopia(), JSON.stringify(gz ? { gz: gz, ts: ts } : { j: JSON.stringify(obj), ts: ts }));
      localStorage.setItem(kClave(), cl);
    } catch (e) {}
    obj.__ts = ts;
    armar(obj);
    cargando = Promise.resolve(datos);
    calentada = false; calentar();
    medida = { ms: Math.round(performance.now() - t0), kb: Math.round((json.__kb || 0) * 10) / 10, n: obj.n };
    avisar();
    return estado();
  }
  var medida = null;

  /* Al abrir con señal: si la copia tiene más de 30 min se renueva de fondo */
  function renovarSiVieja() {
    var e = estado();
    if (!e.hay || !e.clave || e.edad < VIEJA_MS) return;
    if (raiz.SINRED && !SINRED.enLinea()) return;
    preparar('', { fondo: true }).catch(function () {});
  }

  function borrar() {
    try { localStorage.removeItem(kCopia()); localStorage.removeItem(kClave()); } catch (e) {}
    datos = null; mapa = null; cargando = null;
    avisar();
  }

  /* La app misma (index y sus archivos) queda en la caché del service worker:
     sin esto, un teléfono que abrió la app UNA sola vez no la abre sin señal
     (la primera carga ocurre antes de que el SW controle la página). Con la
     caché caliente no viaja nada: el SW contesta de su caché. */
  var calentada = false;
  function calentar() {
    if (calentada || !('serviceWorker' in navigator)) return Promise.resolve(false);
    var ir = function () {
      if (!navigator.serviceWorker.controller) return false;
      calentada = true;
      var urls = ['./', './index.html'];
      document.querySelectorAll('script[src],link[rel="stylesheet"][href],link[rel="manifest"][href],link[rel="icon"][href],img[src]').forEach(function (el) {
        var u = el.getAttribute('src') || el.getAttribute('href');
        try { var abs = new URL(u, location.href); if (abs.origin === location.origin) urls.push(abs.pathname); } catch (e) {}
      });
      ((C && C.extra) || []).forEach(function (u) { urls.push(u); });
      var vistos = {};
      urls = urls.filter(function (u) { if (vistos[u]) return false; vistos[u] = 1; return true; });
      return Promise.all(urls.map(function (u) { return fetch(u, { credentials: 'same-origin' }).then(function (r) { return r.ok; }).catch(function () { return false; }); }))
        .then(function (r) { return r.filter(Boolean).length; });
    };
    if (navigator.serviceWorker.controller) return Promise.resolve(ir());
    return new Promise(function (res) {
      navigator.serviceWorker.addEventListener('controllerchange', function () { res(ir()); }, { once: true });
      setTimeout(function () { res(false); }, 15000);
    });
  }

  function zonas() { return datos && Array.isArray(datos.z) ? datos.z.slice() : null; }

  function hace(ms) {
    var m = Math.round(ms / 60000);
    if (m < 1) return 'hace un momento';
    if (m < 60) return 'hace ' + m + ' min';
    var h = Math.round(m / 60);
    if (h < 48) return 'hace ' + h + ' h';
    return 'hace ' + Math.round(h / 24) + ' días';
  }

  raiz.COPIA = {
    iniciar: function (cfg) {
      C = cfg;
      var luego = function () { calentar(); };
      if ('requestIdleCallback' in raiz) requestIdleCallback(luego, { timeout: 5000 }); else setTimeout(luego, 3000);
      return cargar().then(function () { renovarSiVieja(); return estado(); });
    },
    calentar: calentar,
    al: function (fn) { oyentes.push(fn); },
    estado: estado,
    preparar: preparar,
    borrar: borrar,
    buscarQr: buscarQr,
    buscarDoc: buscarDoc,
    zonas: zonas,
    hace: hace,
    huella: huella,
    medida: function () { return medida; }
  };
})(typeof self !== 'undefined' ? self : this);
