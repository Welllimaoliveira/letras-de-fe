import { esc, shade } from "./util.js";

/** HTML da capa: imagem enviada, ou uma capa tipográfica gerada com a cor do livro. */
export function coverHtml(livro, big = false) {
  const cls = "cover" + (big ? " big" : "");
  if (livro.capa_url) {
    return `<div class="${cls}"><img src="${esc(livro.capa_url)}" alt="Capa de ${esc(livro.titulo)}" loading="lazy"></div>`;
  }
  const base = livro.cor_destaque || "#8a4a2b";
  const c1 = shade(base, -45), c2 = shade(base, -72);
  return `<div class="${cls} gen" style="--c1:${c1};--c2:${c2}">
    <div class="ga">${esc(livro.autor || "")}</div>
    <div><div class="gt">${esc(livro.titulo)}</div></div>
    <div class="gs">✦</div></div>`;
}

export function coverBg(livro) {
  if (livro.capa_url) return `background-image:url('${String(livro.capa_url).replace(/'/g, "%27")}')`;
  const base = livro.cor_destaque || "#8a4a2b";
  return `background:linear-gradient(160deg,${shade(base, -40)},${shade(base, -75)})`;
}
