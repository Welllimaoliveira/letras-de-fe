// Importação de PDF / Word / texto: extrai o texto no navegador e organiza em
// parágrafos; opcionalmente divide em capítulos.

const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/";
const MAMMOTH = "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js";
let pdfjsP = null;

async function loadPdfjs() {
  if (!pdfjsP) {
    pdfjsP = (async () => {
      const lib = await import(PDFJS + "pdf.min.mjs");
      const code = await (await fetch(PDFJS + "pdf.worker.min.mjs")).text();
      lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
      return lib;
    })();
  }
  return pdfjsP;
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("Não consegui carregar " + src));
    document.head.append(s);
  });
}

const tick = () => new Promise(r => setTimeout(r));
const ENDS = /[.!?…”"')\]:;]\s*$/;
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

/* ---------------- PDF ---------------- */
function linesFromItems(items) {
  const lines = []; let cur = null, prevEnd = 0;
  for (const it of items) {
    if (typeof it.str !== "string") continue;
    const [, , , d, x, y] = it.transform;
    const h = it.height || Math.abs(d) || 10;
    if (!cur || Math.abs(y - cur.y) > h * 0.55) {
      if (cur && cur.text.trim()) lines.push(cur);
      cur = { text: "", y, x, h }; prevEnd = x;
    }
    const gap = x - prevEnd;
    const needSpace = cur.text && !/\s$/.test(cur.text) && !/^\s/.test(it.str) && gap > h * 0.18;
    cur.text += (needSpace ? " " : "") + it.str;
    prevEnd = x + (it.width || 0);
  }
  if (cur && cur.text.trim()) lines.push(cur);
  lines.forEach(l => { l.text = l.text.replace(/\s+/g, " ").trim(); });
  return lines.filter(l => l.text);
}

const PAGENUM = /^[\s\-–—]*\d{1,4}[\s\-–—]*$|^(p[áa]gina|page|p[áa]g\.)\s*\d+(\s*(de|of|\/)\s*\d+)?$/i;
const norm = s => s.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();

function isHeadingLine(t) {
  if (t.length > 80) return false;
  if (HEAD_CAP.test(t) || HEAD_PART.test(t) || HEAD_STAND.test(t)) return true;
  return false;
}

function pagesToText(pagesLines) {
  const n = pagesLines.length;
  // cabeçalhos/rodapés repetidos
  const cnt = new Map();
  pagesLines.forEach(ls => {
    const cands = [...ls.slice(0, 2), ...ls.slice(-2)];
    new Set(cands.map(l => norm(l.text))).forEach(k => cnt.set(k, (cnt.get(k) || 0) + 1));
  });
  const minRep = Math.max(3, Math.ceil(n * 0.45));
  const repeated = new Set([...cnt].filter(([k, v]) => v >= minRep && k.length > 0 && !isHeadingLine(k.replace(/#/g, "1"))).map(([k]) => k));

  const all = [];
  pagesLines.forEach((ls, pi) => {
    ls.forEach((l, li) => {
      if (PAGENUM.test(l.text)) return;
      const edge = li < 2 || li >= ls.length - 2;
      if (edge && repeated.has(norm(l.text))) return;
      all.push({ ...l, page: pi, first: false });
    });
  });
  all.forEach((l, i) => { if (i === 0 || all[i - 1].page !== l.page) l.first = true; });
  if (!all.length) return "";

  const gaps = [];
  all.forEach((l, i) => { if (i && !l.first) { const g = all[i - 1].y - l.y; if (g > 0) gaps.push(g); } });
  const lead = median(gaps) || 14;
  const maxLen = pct(all.map(l => l.text.length), 0.9) || 80;
  const leftBy = new Map();
  pagesLines.forEach((ls, pi) => { leftBy.set(pi, pct(ls.map(l => l.x), 0.1)); });

  const paras = []; let cur = "";
  const flush = () => { if (cur.trim()) paras.push(cur.trim()); cur = ""; };
  all.forEach((l, i) => {
    if (i === 0) { cur = l.text; return; }
    const prev = all[i - 1];
    const gap = l.first ? 0 : prev.y - l.y;
    const indent = l.x > (leftBy.get(l.page) || 0) + l.h * 0.9;
    const prevEnds = ENDS.test(prev.text);
    const prevShort = prev.text.length < maxLen * 0.55;
    const head = isHeadingLine(l.text) || isHeadingLine(prev.text);
    let brk = false;
    if (head) brk = true;
    else if (!l.first && gap > lead * 1.55) brk = true;
    else if (indent && prevEnds) brk = true;
    else if (prevShort && prevEnds) brk = true;
    if (brk) { flush(); cur = l.text; return; }
    if (/[a-zà-ú]-$/i.test(cur) && /^[a-zà-ú]/.test(l.text)) cur = cur.slice(0, -1) + l.text;
    else cur += " " + l.text;
  });
  flush();
  return paras.join("\n\n");
}

async function extractPdf(file, onProgress) {
  const lib = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data }).promise;
  const pagesLines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    pagesLines.push(linesFromItems(tc.items));
    if (onProgress) onProgress(p, doc.numPages);
    if (p % 4 === 0) await tick();
  }
  return { text: pagesToText(pagesLines), pages: doc.numPages };
}

/* ---------------- Word / texto ---------------- */
async function extractDocx(file) {
  if (!window.mammoth) await loadScript(MAMMOTH);
  const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return { text: r.value, pages: 0 };
}

async function extractTxt(file) {
  let t = await file.text();
  t = t.replace(/\r\n?/g, "\n");
  if (/\n\s*\n/.test(t)) t = t.split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, " ")).join("\n\n");
  return { text: t, pages: 0 };
}

export function cleanText(t) {
  return String(t || "")
    .replace(/­/g, "").replace(/[​‌‍﻿]/g, "").replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .split(/\n/).map(l => l.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}

/** Lê um arquivo e devolve { text, pages, aviso }. */
export async function extractFromFile(file, onProgress) {
  const name = file.name.toLowerCase();
  let r;
  if (name.endsWith(".pdf") || file.type === "application/pdf") r = await extractPdf(file, onProgress);
  else if (name.endsWith(".docx")) r = await extractDocx(file);
  else if (name.endsWith(".doc")) throw new Error("Arquivos .doc antigos não são suportados — salve como .docx ou PDF.");
  else r = await extractTxt(file);
  const text = cleanText(r.text);
  let aviso = "";
  if (r.pages && text.length < r.pages * 120) aviso = "Quase não encontrei texto. Esse PDF parece ser escaneado (imagens de páginas). Peça uma versão em Word/PDF digital ou use um OCR antes de importar.";
  return { text, pages: r.pages, aviso };
}

/* ---------------- divisão em capítulos ---------------- */
const HEAD_CAP = /^(cap[ií]tulo|cap\.)\s+([0-9]+|[ivxlcdm]{1,7}|[a-zçãõéíáúô]{2,14})\b[\s.:–—-]*(.*)$/i;
const ORD = "primeira|segunda|terceira|quarta|quinta|sexta|s[eé]tima|oitava|nona|d[eé]cima|[úu]nica";
const HEAD_PART = new RegExp("^(parte|livro)\\s+([0-9]+|[ivxlcdm]{1,6}|" + ORD + ")\\b[\\s.:–—-]*(.*)$", "i");
const HEAD_STAND = /^(pr[oó]logo|pref[aá]cio|introdu[cç][aã]o|ep[ií]logo|conclus[aã]o|apresenta[cç][aã]o|agradecimentos|posf[aá]cio|dedicat[oó]ria|considera[cç][oõ]es finais)\s*$/i;
const TOC_LEADER = /[.·…_]{3,}\s*\d+\s*$|\s{2,}\d+\s*$/;

export function splitChapters(text, baseName = "Texto") {
  const paras = String(text || "").split(/\n\s*\n|\n/).map(s => s.trim()).filter(Boolean);
  const out = [];
  let cur = { titulo: null, linhas: [] };
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    const isHead = p.length <= 90 && !TOC_LEADER.test(p) && (HEAD_CAP.test(p) || HEAD_PART.test(p) || HEAD_STAND.test(p));
    if (!isHead) { cur.linhas.push(p); continue; }
    if (cur.linhas.length || cur.titulo) out.push(cur);
    let titulo = p.replace(/\s+/g, " ");
    const onlyNumber = /^(cap[ií]tulo|cap\.|parte|livro)\s+\S+$/i.test(titulo);
    const next = paras[i + 1];
    if (onlyNumber && next && next.length <= 70 && !/[.!?]$/.test(next) && !isHeadingLike(next)) { titulo += " – " + next; i++; }
    cur = { titulo, linhas: [] };
  }
  out.push(cur);

  let caps = out.map(c => ({ titulo: c.titulo, conteudo: c.linhas.join("\n\n") }));
  const real = caps.filter(c => c.titulo);
  if (real.length < 2) return [{ titulo: baseName, conteudo: caps.map(c => (c.titulo ? c.titulo + "\n\n" : "") + c.conteudo).join("\n\n").trim() }];

  // descarta entradas de sumário (títulos com quase nada de texto depois)
  caps = caps.filter((c, i) => !(c.titulo && c.conteudo.length < 120 && i < caps.length - 1));
  if (caps[0] && !caps[0].titulo) {
    if (caps[0].conteudo.length > 300) caps[0].titulo = "Abertura"; else caps.shift();
  }
  return caps.map((c, i) => ({ titulo: c.titulo || `Capítulo ${i + 1}`, conteudo: c.conteudo }));
}

function isHeadingLike(s) { return HEAD_CAP.test(s) || HEAD_PART.test(s) || HEAD_STAND.test(s); }

/* ---------------- revisão: quebra em partes ---------------- */
export function chunkForReview(text, max = 9000) {
  const paras = text.split("\n");
  const chunks = []; let cur = "";
  for (const p of paras) {
    if (cur && (cur.length + p.length + 1) > max) { chunks.push(cur); cur = ""; }
    if (p.length > max) {
      // parágrafo gigante: corta por frases
      const sents = p.split(/(?<=[.!?…])\s+/);
      for (const s of sents) {
        if (cur && cur.length + s.length + 1 > max) { chunks.push(cur); cur = ""; }
        cur += (cur ? " " : "") + s;
      }
    } else cur += (cur ? "\n" : "") + p;
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}
