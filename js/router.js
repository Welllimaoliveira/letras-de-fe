// Roteador por hash (#/livro/slug). Cada navegação limpa a tela e descarta
// renderizações assíncronas antigas (evita telas empilhadas).
const routes = [];
let token = 0;
let cleanup = null;

export const app = () => document.getElementById("app");

export function route(pattern, handler) {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/\/:([a-z]+)(\?)?/gi, (_, k, opt) => { keys.push(k); return opt ? "(?:/([^/]+))?" : "/([^/]+)"; }) + "/?$");
  routes.push({ re, keys, handler });
}

export function go(path) {
  if (location.hash === "#" + path) dispatch(); else location.hash = "#" + path;
}

export function onLeave(fn) { cleanup = fn; }

export async function dispatch() {
  if (cleanup) { try { cleanup(); } catch (e) { /* ignora */ } cleanup = null; }
  const path = decodeURI(location.hash.slice(1) || "/");
  const tk = ++token;
  const ctx = { alive: () => tk === token, query: new URLSearchParams(path.split("?")[1] || "") };
  const clean = path.split("?")[0];
  for (const r of routes) {
    const m = r.re.exec(clean);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = m[i + 1] ? decodeURIComponent(m[i + 1]) : undefined; });
    app().innerHTML = "";
    window.scrollTo(0, 0);
    try { await r.handler(params, ctx); }
    catch (e) {
      console.error(e);
      if (ctx.alive()) app().innerHTML = `<div class="wrap" style="padding:60px 24px"><div class="err">Algo deu errado: ${String(e.message || e).replace(/</g, "&lt;")}</div></div>`;
    }
    return;
  }
  go("/");
}

export function startRouter() {
  window.addEventListener("hashchange", dispatch);
  return dispatch();
}
