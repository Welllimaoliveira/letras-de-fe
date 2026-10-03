export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

let toastTimer;
export function toast(msg, ms = 2600) {
  let n = document.getElementById("toast");
  if (!n) { n = document.createElement("div"); n.id = "toast"; n.className = "toast"; document.body.append(n); }
  n.textContent = msg; n.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => n.classList.add("hidden"), ms);
}

export function slugify(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "livro";
}

export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignora */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } },
};

export function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function fmtNum(n) { return Number(n || 0).toLocaleString("pt-BR"); }

export function shade(hex, pct) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return hex || "#333333";
  const n = parseInt(m[1], 16);
  const f = pct / 100;
  const ch = v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

/* ---------- ícones (stroke) ---------- */
const svg = (d, extra = "") => `<svg viewBox="0 0 24 24" ${extra}>${d}</svg>`;
export const ICON = {
  restart: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  list: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>'),
  bookmark: svg('<path d="M6 3h12v18l-6-4-6 4z"/>', 'class="fillable"'),
  back: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  left: svg('<path d="M15 18l-6-6 6-6"/>'),
  right: svg('<path d="M9 6l6 6-6 6"/>'),
  heart: '♡', heartOn: '♥',
};

/* ---------- markdown-lite ---------- */
function inline(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>");
}

/** Converte texto em blocos [{t, text}] — cada linha não vazia é um bloco. */
export function parseBlocks(src) {
  const out = [];
  for (const raw of String(src || "").replace(/\r\n?/g, "\n").split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) out.push({ t: "h" + m[1].length, text: m[2] });
    else if ((m = /^[-*•]\s+(.*)$/.exec(l))) out.push({ t: "li", text: m[1] });
    else if ((m = /^>\s?(.*)$/.exec(l))) out.push({ t: "q", text: m[1] });
    else out.push({ t: "p", text: l });
  }
  return out;
}

export function blockHtml(b) {
  switch (b.t) {
    case "h1": return `<h1>${inline(b.text)}</h1>`;
    case "h2": return `<h2>${inline(b.text)}</h2>`;
    case "h3": return `<h3>${inline(b.text)}</h3>`;
    case "li": return `<p class="li">• ${inline(b.text)}</p>`;
    case "q": return `<blockquote>${inline(b.text)}</blockquote>`;
    case "ctitle": return `<div class="ctitle"><small>${esc(b.kicker || "")}</small>${esc(b.text)}</div>`;
    default: return `<p>${inline(b.text)}</p>`;
  }
}

export function mdToHtml(src) {
  const h = parseBlocks(src).map(blockHtml).join("");
  return h || `<p class="mut">Nada escrito ainda.</p>`;
}

export function wordCount(s) { return (String(s || "").match(/\S+/g) || []).length; }

/** Reduz uma imagem (capa/foto) antes de enviar. */
export function resizeImage(file, maxW = 900, quality = 0.86) {
  return new Promise((resolve) => {
    if (!/^image\//.test(file.type) || /svg|gif/.test(file.type)) return resolve(file);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, maxW / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => { URL.revokeObjectURL(url); resolve(b ? new File([b], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file); }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
