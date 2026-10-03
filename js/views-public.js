import { supabase, S } from "./supabase.js";
import { app, go, onLeave } from "./router.js";
import { $, $$, el, esc, store, toast, fmtNum, ICON, blockHtml } from "./util.js";
import { coverHtml, coverBg } from "./cover.js";
import { paginate, pageForOffset, estimatePages, PAGE_BUDGET } from "./paginate.js";

/* ---------------- tema ---------------- */
export function applyTema(t) {
  document.documentElement.dataset.tema = t;
  store.set("lf_tema", t);
}
export function currentTema() { return document.documentElement.dataset.tema || "claro"; }

export function brandHtml() {
  const nome = (S.config.nome_site || "Letras de Fé").trim();
  const w = nome.split(/\s+/);
  const first = w.shift();
  return `<a class="brand" href="#/">${esc(first)}${w.length ? ` <b>${esc(w.join(" "))}</b>` : ""}<i></i></a>`;
}

export function publicNav({ back } = {}) {
  const noturno = currentTema() === "noturno";
  const n = el(`<header class="nav"><div class="wrap">
    ${brandHtml()}<span class="spacer"></span>
    ${back ? `<a class="btn dark" href="#/">← Acervo</a>` : `
    <button class="pill-btn" id="btnTema">${noturno ? "☀ Claro" : "☾ Noturno"}</button>
    ${S.profile ? `<a class="btn" href="#/painel">Painel</a>` : ""}
    <a class="btn dark" href="#/" id="btnComecar">Começar a ler</a>`}
  </div></header>`);
  const bt = $("#btnTema", n);
  if (bt) bt.onclick = () => { applyTema(currentTema() === "noturno" ? "claro" : "noturno"); bt.textContent = currentTema() === "noturno" ? "☀ Claro" : "☾ Noturno"; };
  const bc = $("#btnComecar", n);
  if (bc) bc.onclick = (e) => { e.preventDefault(); const a = document.getElementById("acervo"); if (a) a.scrollIntoView({ behavior: "smooth" }); else go("/"); };
  return n;
}

export function footerHtml() {
  const c = S.config;
  return `<footer class="foot"><div class="wrap">
    <span>© ${new Date().getFullYear()} ${esc(c.nome_site || "Letras de Fé")}${c.autora_nome ? " · " + esc(c.autora_nome) : ""}</span>
    <a href="#/${S.profile ? "painel" : "entrar"}">Área da autora</a></div></footer>`;
}

const salvos = () => store.get("lf_salvos", []);
function toggleSalvo(id) {
  const s = salvos(); const i = s.indexOf(id);
  if (i >= 0) s.splice(i, 1); else s.push(id);
  store.set("lf_salvos", s); return i < 0;
}

/* ---------------- início ---------------- */
export async function viewHome(_p, ctx) {
  const root = app();
  root.append(publicNav());
  const body = el(`<div><div class="loading">Carregando…</div></div>`);
  root.append(body);

  const { data, error } = await supabase.from("livros")
    .select("id,titulo,slug,autor,categoria,sinopse,capa_url,cor_destaque,leituras,ordem,created_at")
    .eq("status", "publicado").order("ordem").order("created_at", { ascending: false });
  if (!ctx.alive()) return;
  if (error) { body.innerHTML = `<div class="wrap"><div class="err" style="margin:40px 0">Não consegui carregar os livros: ${esc(error.message)}</div></div>`; return; }
  const livros = data || [];
  const c = S.config;

  body.innerHTML = `
    <section class="hero"><div class="wrap">
      <span class="eyebrow">Leitura gratuita · sem cadastro</span>
      <h1>${esc(c.hero_linha1 || "Palavras que")}<em>${esc(c.hero_linha2 || "alimentam a alma")}</em></h1>
      <div class="frase">${esc(c.hero_frase || "Leia. Medite. Compartilhe.")}</div>
      ${c.subtitulo ? `<p class="lead">${esc(c.subtitulo)}</p>` : ""}
      <div class="ctas"><a class="btn accent" href="#/" id="goAcervo">Explorar o acervo</a>
      ${(c.bio_autora || c.foto_autora_url) ? `<a class="btn ghost" href="#/" id="goSobre">Sobre a autora</a>` : ""}</div>
      <div class="scroll">ROLAR</div>
    </div></section>
    <section class="section" id="acervo"><div class="wrap">
      <span class="eyebrow plain">Acervo completo</span>
      <h2>Livros e escritos,<br><em>sempre gratuitos</em></h2>
      <div class="chips" id="chips"></div>
      <div class="grid" id="grid"></div>
    </div></section>
    ${(c.bio_autora || c.foto_autora_url) ? `<section class="section" id="sobre" style="background:var(--cream)"><div class="wrap">
      <span class="eyebrow plain">Sobre a autora</span>
      <h2 style="margin-bottom:26px">${esc(c.autora_nome || "Quem escreve")}</h2>
      <div class="about">${c.foto_autora_url ? `<img src="${esc(c.foto_autora_url)}" alt="">` : `<div class="ph"></div>`}
      <p>${esc(c.bio_autora || "")}</p></div></div></section>` : ""}
    ${footerHtml()}`;

  const scrollTo = (id) => (e) => { e.preventDefault(); const t = document.getElementById(id); if (t) t.scrollIntoView({ behavior: "smooth" }); };
  $("#goAcervo", body).onclick = scrollTo("acervo");
  const gs = $("#goSobre", body); if (gs) gs.onclick = scrollTo("sobre");

  const cats = [...new Set(livros.map(l => (l.categoria || "").trim()).filter(Boolean))];
  let filtro = "todos";
  const chips = $("#chips", body), grid = $("#grid", body);

  function drawChips() {
    const items = [["todos", "Todos"], ...cats.map(k => [k, k])];
    if (salvos().length) items.push(["__salvos", "♡ Salvos"]);
    chips.innerHTML = "";
    if (items.length <= 1) return;
    items.forEach(([k, label]) => {
      const b = el(`<button class="chip ${filtro === k ? "on" : ""}">${esc(label)}</button>`);
      b.onclick = () => { filtro = k; drawChips(); drawGrid(); };
      chips.append(b);
    });
  }
  function drawGrid() {
    grid.innerHTML = "";
    let list = livros;
    if (filtro === "__salvos") list = livros.filter(l => salvos().includes(l.id));
    else if (filtro !== "todos") list = livros.filter(l => (l.categoria || "").trim() === filtro);
    if (!list.length) { grid.style.display = "block"; grid.innerHTML = `<div class="empty">${livros.length ? "Nada por aqui ainda." : "Em breve, os primeiros livros."}</div>`; return; }
    grid.style.display = "";
    list.forEach(l => {
      const card = el(`<button class="card">${coverHtml(l)}<div class="meta">
        <div class="t">${esc(l.titulo)}</div><div class="a">${esc(l.autor || c.autora_nome || "")}</div>
        ${l.categoria ? `<div class="c">${esc(l.categoria)}</div>` : ""}</div></button>`);
      card.onclick = () => openModal(l);
      grid.append(card);
    });
  }
  drawChips(); drawGrid();
}

function openModal(l) {
  const back = el(`<div class="modal-back"><div class="modal-card" role="dialog">
    <div class="modal-head" style="${coverBg(l)}"><h3>${esc(l.titulo)}</h3><div class="au">${esc(l.autor || S.config.autora_nome || "")}</div></div>
    <div class="modal-body">
      ${l.categoria ? `<span class="tag">${esc(l.categoria)}</span>` : ""}
      <p>${esc(l.sinopse || "Clique em “Ler agora” para começar.")}</p><hr>
      <div class="row"><button class="btn accent" id="mLer">Ler agora</button><button class="btn" id="mFechar">Fechar</button></div>
    </div></div></div>`);
  const close = () => { back.remove(); document.removeEventListener("keydown", esc_); };
  const esc_ = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", esc_);
  back.onclick = (e) => { if (e.target === back) close(); };
  $("#mFechar", back).onclick = close;
  $("#mLer", back).onclick = () => { close(); go("/livro/" + l.slug); };
  document.body.append(back);
}

/* ---------------- detalhe do livro ---------------- */
export async function viewLivro({ slug }, ctx) {
  const root = app();
  root.append(publicNav({ back: true }));
  const body = el(`<div class="loading">Carregando…</div>`); root.append(body);
  const { data: livro } = await supabase.from("livros").select("*").eq("slug", slug).maybeSingle();
  if (!ctx.alive()) return;
  if (!livro) { body.className = ""; body.innerHTML = `<div class="wrap"><div class="empty">Livro não encontrado.</div><p style="text-align:center"><a class="btn" href="#/">Voltar ao acervo</a></p></div>`; return; }
  const { data: caps } = await supabase.from("capitulos").select("id,titulo,ordem,status,caracteres").eq("livro_id", livro.id).order("ordem");
  if (!ctx.alive()) return;
  const lista = (caps || []).filter(c => S.profile || c.status === "publicado");
  const chars = lista.reduce((a, c) => a + (c.caracteres || 0), 0);
  const paginas = estimatePages(chars);
  const prog = store.get("lf_prog_" + livro.id, null);
  const pct = prog && prog.total ? Math.min(99, Math.round((prog.page / prog.total) * 100)) : 0;
  const salvo = salvos().includes(livro.id);

  body.className = ""; body.innerHTML = `
    <section class="dhero"><div class="wrap">
      <div>${coverHtml(livro, true)}</div>
      <div>
        <div class="eyebrow">${esc(livro.categoria || "Livro")}${livro.status !== "publicado" ? " · RASCUNHO" : ""}</div>
        <h1>${esc(livro.titulo)}</h1>
        <div class="au">${esc(livro.autor || S.config.autora_nome || "")}</div>
        <div class="free">Leia online agora, grátis e sem cadastro</div>
        <div class="stats">
          <div><b>${lista.length ? "≈" + fmtNum(paginas) : "—"}</b><span>Páginas</span></div>
          <div><b>${fmtNum(livro.leituras)}</b><span>Leituras</span></div>
          <div><b>Grátis</b><span>Acesso</span></div></div>
        <div class="row wrapflex">
          <a class="btn accent" href="#/ler/${esc(livro.slug)}" style="padding:16px 30px">📖 ${prog && pct > 0 ? `Continuar (${pct}%)` : "Ler agora"}</a>
          <button class="btn ghost2" id="btnSalvar">${salvo ? ICON.heartOn + " Salvo" : ICON.heart + " Salvar"}</button>
        </div></div></div></section>
    <section class="dsec"><div class="wrap">
      ${livro.sinopse ? `<h2>Sobre o livro</h2><p class="sin">${esc(livro.sinopse)}</p>` : ""}
      <h2 style="margin-top:38px">Sumário</h2>
      <div class="toc" id="toc"></div>
    </div></section>${footerHtml()}`;

  const toc = $("#toc", body);
  if (!lista.length) toc.innerHTML = `<div class="empty" style="padding:30px 0">Os capítulos ainda estão sendo preparados.</div>`;
  lista.forEach((c, i) => {
    const b = el(`<button><span class="n">${i + 1}</span><span class="tt">${esc(c.titulo)}</span>${c.status !== "publicado" ? `<span class="badge warn">rascunho</span>` : ""}</button>`);
    b.onclick = () => go(`/ler/${livro.slug}/${c.id}`);
    toc.append(b);
  });
  $("#btnSalvar", body).onclick = (e) => { const on = toggleSalvo(livro.id); e.currentTarget.innerHTML = on ? ICON.heartOn + " Salvo" : ICON.heart + " Salvar"; toast(on ? "Livro salvo neste aparelho." : "Removido dos salvos."); };
}

/* ---------------- leitor ---------------- */
export async function viewLer({ slug, capId }, ctx) {
  const root = app();
  root.innerHTML = `<div class="loading">Abrindo o livro…</div>`;
  const { data: livro } = await supabase.from("livros").select("*").eq("slug", slug).maybeSingle();
  if (!ctx.alive()) return;
  if (!livro) { root.innerHTML = `<div class="wrap"><div class="empty">Livro não encontrado.</div><p style="text-align:center"><a class="btn" href="#/">Voltar</a></p></div>`; return; }
  const { data: caps } = await supabase.from("capitulos").select("id,titulo,ordem,status,conteudo").eq("livro_id", livro.id).order("ordem");
  if (!ctx.alive()) return;
  const chapters = (caps || []).filter(c => S.profile || c.status === "publicado");
  if (!chapters.length) { root.innerHTML = `<div class="wrap"><div class="empty">Este livro ainda não tem capítulos publicados.</div><p style="text-align:center"><a class="btn" href="#/livro/${esc(slug)}">Voltar</a></p></div>`; return; }

  const rk = "lf_read_" + livro.id;
  if (!sessionStorage.getItem(rk) && livro.status === "publicado") { sessionStorage.setItem(rk, "1"); supabase.rpc("registrar_leitura", { p_livro: livro.id }).then(() => {}, () => {}); }

  const prefs = store.get("lf_pref", { fs: 19, fonte: "serif" });
  const R = { livro, chapters, i: 0, pg: null, fs: prefs.fs, fonte: prefs.fonte };
  const bud = () => Math.max(700, Math.min(3200, Math.round(PAGE_BUDGET * Math.pow(19 / R.fs, 1.6))));
  const build = () => { R.pg = paginate(chapters, bud()); };
  build();

  const progKey = "lf_prog_" + livro.id, markKey = "lf_marks_" + livro.id;
  const saved = store.get(progKey, null);
  if (capId) { const ci = chapters.findIndex(c => c.id === capId); R.i = ci >= 0 ? R.pg.chapterStart[ci] : 0; }
  else if (saved && saved.off != null && saved.page > 0) R.i = pageForOffset(R.pg.pages, saved.off);

  root.innerHTML = `<div class="rd">
    <div class="rd-bar">${brandHtml()}<div class="rd-title">${esc(livro.titulo)}</div>
      <button class="ibtn" id="bRestart" title="Voltar ao início">${ICON.restart}</button>
      <button class="ibtn" id="bToc" title="Sumário">${ICON.list}</button>
      <button class="ibtn" id="bMark" title="Marcador">${ICON.bookmark}</button>
      <button class="ibtn" id="bBack" title="Sair da leitura">${ICON.back}</button>
      <button class="ibtn" id="bCfg" title="Configurações">${ICON.sun}</button></div>
    <div class="rd-main" id="rdMain"></div>
    <div class="rd-foot"><button class="nbtn" id="bPrev">${ICON.left}</button>
      <div class="prog"><div class="bar"><i id="pBar"></i></div><small id="pLbl"></small></div>
      <button class="nbtn" id="bNext">${ICON.right}</button></div></div>`;
  document.documentElement.style.setProperty("--fs", R.fs + "px");

  const main = $("#rdMain", root);
  const pageOff = (i) => (R.pg.pages[i] && R.pg.pages[i].offset) || 0;
  const marks = () => store.get(markKey, []);
  const isMarked = (i) => { const off = pageOff(i); const nxt = R.pg.pages[i + 1] ? pageOff(i + 1) : Infinity; return marks().some(m => m >= off && m < nxt); };

  function show(i) {
    const n = R.pg.pages.length;
    R.i = Math.max(0, Math.min(n - 1, i));
    const pg = R.pg.pages[R.i];
    main.innerHTML = "";
    if (pg.kind === "cover") {
      main.append(el(`<div class="rd-cover">${livro.capa_url ? `<img src="${esc(livro.capa_url)}" alt="">` : coverHtml(livro, true)}
        <div class="over"><div class="eyebrow">${esc(livro.categoria || "Livro")}</div><h2>${esc(livro.titulo)}</h2>
        <div class="au">${esc(livro.autor || S.config.autora_nome || "")}</div>
        <button class="btn" id="bStart">Começar a leitura →</button></div></div>`));
      $("#bStart", main).onclick = () => show(1);
    } else {
      const card = el(`<div class="rd-card"><div class="rd-text">${pg.blocks.map(blockHtml).join("")}</div></div>`);
      main.append(card);
    }
    $("#pBar", root).style.width = (n > 1 ? (R.i / (n - 1)) * 100 : 0) + "%";
    $("#pLbl", root).textContent = R.i === 0 ? "Capa" : `Página ${R.i} de ${n - 1}`;
    $("#bPrev", root).disabled = R.i === 0;
    $("#bNext", root).disabled = R.i >= n - 1;
    $("#bMark", root).classList.toggle("on", R.i > 0 && isMarked(R.i));
    if (R.i > 0) store.set(progKey, { off: pageOff(R.i), page: R.i, total: n - 1, ts: Date.now() });
  }

  function sheet(title, inner) {
    const back = el(`<div class="sheet-back"><div class="sheet"><div class="row"><h3 class="grow">${esc(title)}</h3><button class="ibtn" id="sx">✕</button></div>${inner}</div></div>`);
    const close = () => back.remove();
    back.onclick = (e) => { if (e.target === back) close(); };
    $("#sx", back).onclick = close;
    document.body.append(back);
    return { back, close };
  }

  $("#bPrev", root).onclick = () => show(R.i - 1);
  $("#bNext", root).onclick = () => show(R.i + 1);
  $("#bRestart", root).onclick = () => show(0);
  $("#bBack", root).onclick = () => go("/livro/" + slug);
  $("#bMark", root).onclick = () => {
    if (R.i === 0) return toast("Abra uma página de texto para marcar.");
    const off = pageOff(R.i), nxt = R.pg.pages[R.i + 1] ? pageOff(R.i + 1) : Infinity;
    let m = marks();
    if (isMarked(R.i)) { m = m.filter(x => !(x >= off && x < nxt)); toast("Marcador removido."); }
    else { m.push(off); toast("Página marcada."); }
    store.set(markKey, m); $("#bMark", root).classList.toggle("on", isMarked(R.i));
  };
  $("#bToc", root).onclick = () => {
    const mk = marks().sort((a, b) => a - b);
    const { back, close } = sheet("Sumário", `<div id="tocList"></div>${mk.length ? `<div class="lbl" style="margin-top:22px">Marcadores</div><div id="mkList"></div>` : ""}`);
    chapters.forEach((c, ci) => {
      const b = el(`<button class="li-row">${esc(c.titulo)}<span>pág. ${R.pg.chapterStart[ci]}</span></button>`);
      b.onclick = () => { close(); show(R.pg.chapterStart[ci]); };
      $("#tocList", back).append(b);
    });
    mk.forEach(off => {
      const pi = pageForOffset(R.pg.pages, off);
      const b = el(`<button class="li-row">Página ${pi}<span>marcador</span></button>`);
      b.onclick = () => { close(); show(pi); };
      $("#mkList", back).append(b);
    });
  };
  $("#bCfg", root).onclick = () => {
    const { back } = sheet("Configurações", `
      <div class="lbl">Tema</div><div class="opt" id="oTema"></div>
      <div class="lbl">Tamanho do texto</div><div class="opt" id="oFs"><button data-d="-1">A−</button><button disabled id="fsv">${R.fs}px</button><button data-d="1">A+</button></div>
      <div class="lbl">Fonte</div><div class="opt" id="oFonte"><button data-f="serif">Serifada</button><button data-f="sans">Sem serifa</button></div>`);
    const drawT = () => { const o = $("#oTema", back); o.innerHTML = ""; [["claro", "Claro"], ["sepia", "Sépia"], ["noturno", "Noturno"]].forEach(([k, l]) => { const b = el(`<button class="${currentTema() === k ? "on" : ""}">${l}</button>`); b.onclick = () => { applyTema(k); drawT(); }; o.append(b); }); };
    drawT();
    const drawF = () => $$("#oFonte button", back).forEach(b => b.classList.toggle("on", b.dataset.f === R.fonte));
    drawF();
    $$("#oFonte button", back).forEach(b => b.onclick = () => { R.fonte = b.dataset.f; applyFonte(); drawF(); store.set("lf_pref", { fs: R.fs, fonte: R.fonte }); });
    $$("#oFs button[data-d]", back).forEach(b => b.onclick = () => {
      const off = pageOff(R.i);
      R.fs = Math.max(14, Math.min(30, R.fs + (+b.dataset.d) * 2));
      document.documentElement.style.setProperty("--fs", R.fs + "px");
      $("#fsv", back).textContent = R.fs + "px";
      build(); show(R.i === 0 ? 0 : pageForOffset(R.pg.pages, off));
      store.set("lf_pref", { fs: R.fs, fonte: R.fonte });
    });
  };
  function applyFonte() { document.documentElement.style.setProperty("--f-read", R.fonte === "sans" ? "'Syne',system-ui,sans-serif" : "'Lora',Georgia,serif"); }
  applyFonte();

  const onKey = (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (e.key === "ArrowRight") show(R.i + 1); else if (e.key === "ArrowLeft") show(R.i - 1);
  };
  let tx = null;
  const ts = (e) => { tx = e.changedTouches[0].clientX; };
  const te = (e) => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 70) show(R.i + (dx < 0 ? 1 : -1)); };
  document.addEventListener("keydown", onKey);
  main.addEventListener("touchstart", ts, { passive: true });
  main.addEventListener("touchend", te, { passive: true });
  onLeave(() => { document.removeEventListener("keydown", onKey); document.documentElement.style.removeProperty("--f-read"); });

  show(R.i);
}
