import { parseBlocks } from "./util.js";

export const PAGE_BUDGET = 1800; // caracteres por página (com fonte 19px)

function splitLong(text, max) {
  if (text.length <= max) return [text];
  const sentences = text.split(/(?<=[.!?…”"])\s+/);
  const out = []; let cur = "";
  for (const s of sentences) {
    if (cur && (cur + " " + s).length > max) { out.push(cur); cur = s; }
    else cur = cur ? cur + " " + s : s;
  }
  if (cur) out.push(cur);
  // pedaço sem pontuação nenhuma: corta em espaço
  const final = [];
  for (const p of out) {
    let t = p;
    while (t.length > max * 1.6) {
      let k = t.lastIndexOf(" ", max);
      if (k < max * 0.5) k = max;
      final.push(t.slice(0, k)); t = t.slice(k).trim();
    }
    final.push(t);
  }
  return final;
}

/**
 * Divide os capítulos em páginas de leitura.
 * Retorna { pages, chapterStart, total } — pages[0] é sempre a capa.
 */
export function paginate(chapters, budget = PAGE_BUDGET) {
  const pages = [{ kind: "cover" }];
  const chapterStart = [];
  let offset = 0;
  const multi = chapters.length > 1;

  chapters.forEach((cap, ci) => {
    const raw = [{ t: "ctitle", text: cap.titulo, kicker: multi ? `Capítulo ${ci + 1}` : "" }, ...parseBlocks(cap.conteudo)];
    const blocks = [];
    for (const b of raw) {
      if (b.t === "p" && b.text.length > budget) splitLong(b.text, budget).forEach(t => blocks.push({ t: "p", text: t }));
      else blocks.push(b);
    }
    let cur = null, used = 0;
    chapterStart[ci] = pages.length;
    for (const b of blocks) {
      const len = b.text.length + 40;
      if (cur && used + len > budget && !(cur.blocks.length === 1 && cur.blocks[0].t === "ctitle")) {
        pages.push(cur); cur = null;
      }
      if (!cur) { cur = { kind: "text", ci, blocks: [], offset }; used = 0; }
      cur.blocks.push(b); used += len; offset += b.text.length;
    }
    if (cur) pages.push(cur);
  });

  return { pages, chapterStart, total: offset };
}

export function pageForOffset(pages, off) {
  let best = 1;
  for (let i = 1; i < pages.length; i++) { if (pages[i].offset <= off) best = i; else break; }
  return Math.min(best, pages.length - 1);
}

export function estimatePages(chars) { return Math.max(1, Math.ceil((chars || 0) / (PAGE_BUDGET * 0.82))) + 1; }
