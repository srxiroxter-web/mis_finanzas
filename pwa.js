/* pwa.js — conecta la app instalada con tu Apps Script (con clave) y registra el modo sin conexión.
 * Se carga ANTES del código de la app. No contiene datos personales: el código de conexión
 * (enlace + clave) se escribe una sola vez en el celular y queda guardado ahí. */
(function () {
  'use strict';
  if (window.google && window.google.script && window.google.script.run) return; // dentro de Apps Script no hace falta

  var K_URL = 'mf-api-url', K_KEY = 'mf-api-key';
  var mem = {};
  function sget(k) { try { var v = window.localStorage.getItem(k); return v == null ? (mem[k] || '') : v; } catch (e) { return mem[k] || ''; } }
  function sset(k, v) { mem[k] = v; try { window.localStorage.setItem(k, v); } catch (e) {} }
  function sdel(k) { delete mem[k]; try { window.localStorage.removeItem(k); } catch (e) {} }

  function parseCode(text) {
    var m = /^(https:\/\/script\.google\.com\/\S*?\/exec)[?&]k=([A-Za-z0-9]{16,})$/.exec(String(text || '').trim());
    return m ? { url: m[1], key: m[2] } : null;
  }

  // Un pedido al Apps Script. text/plain evita la consulta previa (CORS) que Apps Script no responde.
  function post(url, key, fn, arg, signal) {
    return fetch(url, {
      method: 'POST', redirect: 'follow', signal: signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ k: key, f: fn, a: arg === undefined ? null : arg })
    }).then(function (r) { return r.text(); }).then(function (t) {
      try { return JSON.parse(t); }
      catch (e) { throw new Error('El servidor no respondió como se esperaba. ¿Publicaste la nueva versión del script ("Nueva versión")?'); }
    }, function () {
      // Falló antes de recibir respuesta: ¿no hay internet, o Google respondió pero no deja pasar?
      return fetch(url, { mode: 'no-cors', cache: 'no-store' }).then(function () {
        throw new Error('Tu script respondió, pero no deja entrar a la app. Revisa en Apps Script (Implementar → Administrar implementaciones) que "Quién tiene acceso" sea "Cualquier persona" y que hayas publicado la nueva versión.');
      }, function () {
        throw new Error('No hay conexión con tu hoja. Revisa tu internet y que el enlace termine en /exec.');
      });
    });
  }

  function call(fn, arg) {
    var url = sget(K_URL), key = sget(K_KEY);
    if (!url || !key) { showSetup(''); return Promise.reject(new Error('Falta conectar la app.')); }
    return post(url, key, fn, arg).then(function (res) {
      if (res && res.s === 'ok') return res.v;
      if (res && res.s === 'denied') {
        sdel(K_KEY);
        showSetup('La clave ya no coincide con la de tu script. Pega el código de conexión nuevo.');
        throw new Error('Clave no válida.');
      }
      throw new Error((res && res.m) || 'Error del servidor.');
    });
  }

  function mk(ok, fail) {
    return new Proxy({}, {
      get: function (_, fn) {
        if (fn === 'withSuccessHandler') return function (f) { return mk(f, fail); };
        if (fn === 'withFailureHandler') return function (f) { return mk(ok, f); };
        if (typeof fn !== 'string') return undefined;
        return function (arg) {
          call(fn, arg).then(function (v) { if (ok) ok(v); }, function (e) { if (fail) fail(e); });
        };
      }
    });
  }
  window.google = { script: { run: mk(null, null) } };

  /* ---------- Pantalla de conexión (solo la primera vez) ---------- */
  var box = null;
  function showSetup(msg) {
    function build() {
      if (!box) {
        box = document.createElement('div');
        box.id = 'pwa-setup';
        box.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;background:#0F172A;color:#F1F5F9;display:flex;align-items:center;justify-content:center;padding:20px;font-family:ui-sans-serif,system-ui,sans-serif;overflow:auto');
        box.innerHTML =
          '<div style="width:100%;max-width:380px;text-align:center">' +
            '<img src="icons/icon-192.png" alt="" width="84" height="84" style="border-radius:20px;box-shadow:0 0 40px rgba(52,211,153,.25)">' +
            '<h1 style="font-size:22px;font-weight:600;margin:16px 0 4px">Conectar tu app</h1>' +
            '<p style="color:#94A3B8;font-size:14px;line-height:1.45;margin:0 0 16px">Pega el <b>código de conexión</b> que te mostró tu script (lo haces una sola vez en este celular).</p>' +
            '<textarea id="pwa-code" rows="4" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec?k=…" style="width:100%;box-sizing:border-box;background:#111C33;color:#F1F5F9;border:1px solid #334155;border-radius:14px;padding:12px;font-size:16px;resize:none"></textarea>' +
            '<div id="pwa-err" role="alert" style="min-height:20px;margin:8px 0;color:#F87171;font-size:13px"></div>' +
            '<button id="pwa-go" type="button" style="width:100%;padding:14px;border-radius:14px;border:0;font-size:16px;font-weight:600;color:#06202E;background:linear-gradient(135deg,#38BDF8,#34D399)">Conectar</button>' +
          '</div>';
        document.body.appendChild(box);
        box.querySelector('#pwa-go').addEventListener('click', connect);
      }
      box.style.display = 'flex';
      if (msg) box.querySelector('#pwa-err').textContent = msg;   // varios pedidos a la vez no deben borrar el aviso
    }
    if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
  }

  var busy = false;
  function connect() {
    if (busy) return;
    var err = document.getElementById('pwa-err'), btn = document.getElementById('pwa-go');
    var c = parseCode(document.getElementById('pwa-code').value);
    if (!c) { err.textContent = 'El código debe verse así: https://script.google.com/…/exec?k=… (cópialo completo).'; return; }
    busy = true; btn.textContent = 'Conectando…'; btn.disabled = true; err.textContent = '';
    post(c.url, c.key, 'ping').then(function (res) {
      if (res && res.s === 'ok') { sset(K_URL, c.url); sset(K_KEY, c.key); window.location.reload(); return; }
      err.textContent = res && res.s === 'denied' ? 'La clave no coincide. Copia de nuevo el código desde el Registro de ejecución.' : ((res && res.m) || 'No se pudo conectar.');
    }).catch(function (e) { err.textContent = e.message; })
      .then(function () { busy = false; btn.textContent = 'Conectar'; btn.disabled = false; });
  }

  if (!sget(K_URL) || !sget(K_KEY)) showSetup('');

  /* ---------- Modo sin conexión ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
