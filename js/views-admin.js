import { supabase, S, carregarProfile, carregarConfig, MOCK } from "./supabase.js";
import { app, go } from "./router.js";
import { $, $$, el, esc, toast, slugify, store, debounce, wordCount, fmtNum, resizeImage } from "./util.js";
import { coverHtml } from "./cover.js";
import { brandHtml, applyTema } from "./views-public.js";
import { extractFromFile, splitChapters, chunkForReview } from "./import.js";

const CORES = ["#b5532b", "#8a4a2b", "#c28a3d", "#4c6b54", "#3f6b8c", "#9a3b4e", "#5b4a7a", "#2b2a27"];
const CATEGORIAS = ["Devocional", "Estudo bíblico", "Reflexão", "Poesia", "Romance cristão", "Série", "Infantil"];

export function applyConfig(cfg) {
  const r = document.documentElement.style;
  if (cfg && cfg.cor_primaria) r.setProperty("--accent", cfg.cor_primaria);
  document.title = (cfg && cfg.nome_site) || "Letras de Fé";
}

function guard() {
  if (S.profile) return true;
  go("/entrar");
  return false;
}

function adminNav(active) {
  const n = el(`<header class="nav"><div class="wrap">${brandHtml()}<span class="spacer"></span>
    <a class="btn" href="#/">Ver site</a><button class="btn dark" id="aSair">Sair</button></div></header>`);
  $("#aSair", n).onclick = async () => { await supabase.auth.signOut(); await carregarProfile(null); toast("Você saiu."); go("/"); };
  return n;
}

function tabs(active) {
  return `<div class="tabs"><a href="#/painel" class="${active === "livros" ? "on" : ""}">Livros</a>
    <a href="#/painel/aparencia" class="${active === "aparencia" ? "on" : ""}">Aparência do site</a></div>`;
}

async function uploadImage(file, folder) {
  const f = await resizeImage(file, folder === "autora" ? 600 : 900);
  if (MOCK) return URL.createObjectURL(f);
  const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${folder}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("capas").upload(path, f, { upsert: true, contentType: f.type });
  if (error) throw error;
  return supabase.storage.from("capas").getPublicUrl(path).data.publicUrl;
}

/* ---------------- login ---------------- */
export async function viewEntrar() {
  if (S.profile) return go("/painel");
  const root = app();
  root.append(el(`<header class="nav"><div class="wrap">${brandHtml()}<span class="spacer"></span><a class="btn" href="#/">← Site</a></div></header>`));
  const box = el(`<div class="login">
    <span class="eyebrow plain">Área da autora</span>
    <h1>Entrar</h1><p class="mut small">Acesso restrito a quem escreve. Os leitores não precisam de conta.</p>
    <label class="lbl2">E-mail</label><input class="field" id="eEmail" type="email" autocomplete="email">
    <label class="lbl2">Senha</label><input class="field" id="eSenha" type="password" autocomplete="current-password">
    <div style="margin-top:18px"><button class="btn accent wide" id="eEntrar">Entrar</button>
    <button class="btn ghost wide" id="eCriar" style="margin-top:8px">Criar conta (primeira vez)</button></div>
    <p class="small mut" id="eMsg" style="margin-top:14px"></p></div>`);
  root.append(box);
  const msg = $("#eMsg", box);
  const entrar = async () => {
    const email = $("#eEmail", box).value.trim(), password = $("#eSenha", box).value;
    if (!email || !password) { msg.textContent = "Preencha e-mail e senha."; return; }
    msg.textContent = "Entrando…";
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { msg.textContent = "Não consegui entrar: " + error.message; return; }
    await carregarProfile(data.session);
    if (S.profile) go("/painel"); else msg.textContent = "Login ok, mas esta conta não tem acesso de autora.";
  };
  $("#eEntrar", box).onclick = entrar;
  $("#eSenha", box).addEventListener("keydown", e => { if (e.key === "Enter") entrar(); });
  $("#eCriar", box).onclick = async () => {
    const email = $("#eEmail", box).value.trim(), password = $("#eSenha", box).value;
    if (!email || password.length < 6) { msg.textContent = "Informe o e-mail e uma senha de pelo menos 6 caracteres."; return; }
    msg.textContent = "Criando conta…";
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { msg.textContent = "Não consegui criar: " + error.message; return; }
    if (data.session) { await carregarProfile(data.session); if (S.profile) return go("/painel"); }
    msg.textContent = "Conta criada. Se o Supabase pediu confirmação, confira seu e-mail e depois clique em Entrar.";
  };
}

/* ---------------- lista de livros ---------------- */
export async function viewPainel(_p, ctx) {
  if (!guard()) return;
  const root = app();
  root.append(adminNav());
  const wrap = el(`<div class="adm"><h1>Painel da autora</h1><p class="mut">Crie livros, escreva ou importe os textos, revise com a IA e publique.</p>
    ${tabs("livros")}<div id="pb"><div class="loading">Carregando…</div></div></div>`);
  root.append(wrap);
  const [{ data: livros, error }, { data: caps }] = await Promise.all([
    supabase.from("livros").select("*").order("ordem").order("created_at", { ascending: false }),
    supabase.from("capitulos").select("livro_id,status"),
  ]);
  if (!ctx.alive()) return;
  const pb = $("#pb", wrap);
  if (error) { pb.innerHTML = `<div class="err">${esc(error.message)}${/column|schema/i.test(error.message) ? "<br>Parece que a migração do banco ainda não foi rodada (migrations/002)." : ""}</div>`; return; }
  const cnt = {}; (caps || []).forEach(c => { cnt[c.livro_id] = cnt[c.livro_id] || { t: 0, p: 0 }; cnt[c.livro_id].t++; if (c.status === "publicado") cnt[c.livro_id].p++; });

  pb.innerHTML = `<a class="btn accent" href="#/painel/livro/novo" style="margin-bottom:18px">+ Novo livro</a><div class="box" id="lista" style="padding:6px 22px"></div>`;
  const lista = $("#lista", pb);
  if (!livros.length) lista.innerHTML = `<div class="empty" style="padding:34px 0">Nenhum livro ainda. Clique em “Novo livro”.</div>`;
  livros.forEach((l, i) => {
    const c = cnt[l.id] || { t: 0, p: 0 };
    const row = el(`<div class="bk-row"><div>${coverHtml(l)}</div>
      <div><h3>${esc(l.titulo)}</h3><div class="small mut">${esc(l.autor || "")}${l.categoria ? " · " + esc(l.categoria) : ""}</div>
        <div style="margin-top:6px"><span class="badge ${l.status === "publicado" ? "ok" : "warn"}">${l.status === "publicado" ? "Publicado" : "Rascunho"}</span>
        <span class="small mut" style="margin-left:8px">${c.p}/${c.t} capítulos publicados · ${fmtNum(l.leituras)} leituras</span></div></div>
      <div class="acts"><a class="btn sm" href="#/painel/livro/${l.id}">Editar</a><a class="btn sm" href="#/livro/${esc(l.slug)}">Ver</a>
        <button class="btn sm" data-a="st">${l.status === "publicado" ? "Despublicar" : "Publicar"}</button>
        <button class="btn sm" data-a="up" ${i === 0 ? "disabled" : ""}>▲</button><button class="btn sm" data-a="dn" ${i === livros.length - 1 ? "disabled" : ""}>▼</button>
        <button class="btn sm danger" data-a="rm">Apagar</button></div></div>`);
    $('[data-a="st"]', row).onclick = async () => {
      const { error } = await supabase.from("livros").update({ status: l.status === "publicado" ? "rascunho" : "publicado" }).eq("id", l.id);
      if (error) return toast("Erro: " + error.message); toast("Atualizado."); go("/painel");
    };
    const swap = async (o) => {
      const a = livros[i], b = livros[o];
      const [oa, ob] = [a.ordem, b.ordem];
      const na = oa === ob ? o : ob, nb = oa === ob ? i : oa;
      await Promise.all([supabase.from("livros").update({ ordem: na }).eq("id", a.id), supabase.from("livros").update({ ordem: nb }).eq("id", b.id)]);
      go("/painel");
    };
    $('[data-a="up"]', row).onclick = () => swap(i - 1);
    $('[data-a="dn"]', row).onclick = () => swap(i + 1);
    $('[data-a="rm"]', row).onclick = async () => {
      if (!confirm(`Apagar “${l.titulo}” e todos os capítulos? Não dá para desfazer.`)) return;
      const { error } = await supabase.from("livros").delete().eq("id", l.id);
      if (error) return toast("Erro: " + error.message); toast("Livro apagado."); go("/painel");
    };
    lista.append(row);
  });
}

/* ---------------- editor de livro ---------------- */
export async function viewLivroEd({ id }, ctx) {
  if (!guard()) return;
  const root = app();
  root.append(adminNav());
  const novo = id === "novo";
  let livro = { titulo: "", autor: S.config.autora_nome || "", categoria: "", sinopse: "", cor_destaque: CORES[1], status: "rascunho", capa_url: null };
  if (!novo) {
    const { data } = await supabase.from("livros").select("*").eq("id", id).maybeSingle();
    if (!ctx.alive()) return;
    if (!data) { root.append(el(`<div class="adm"><div class="err">Livro não encontrado.</div><p><a class="btn" href="#/painel">Voltar</a></p></div>`)); return; }
    livro = data;
  }
  const wrap = el(`<div class="adm"><a class="small" href="#/painel">← Todos os livros</a>
    <h1>${novo ? "Novo livro" : esc(livro.titulo)}</h1>${tabs("livros")}
    <div class="box"><h2>Dados do livro</h2>
      <label class="lbl2">Título</label><input class="field" id="fTitulo" value="${esc(livro.titulo)}">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px"><div><label class="lbl2">Autora / autor</label><input class="field" id="fAutor" value="${esc(livro.autor || "")}"></div>
      <div><label class="lbl2">Categoria</label><input class="field" id="fCat" list="cats" value="${esc(livro.categoria || "")}" placeholder="Ex.: Devocional">
      <datalist id="cats">${CATEGORIAS.map(c => `<option value="${esc(c)}">`).join("")}</datalist></div></div>
      <label class="lbl2">Sinopse (aparece no cartão do livro)</label><textarea class="field" id="fSin" rows="4">${esc(livro.sinopse || "")}</textarea>
      <div style="display:grid;grid-template-columns:150px 1fr;gap:22px;margin-top:6px">
        <div><label class="lbl2">Capa</label><div id="capaPrev"></div></div>
        <div><label class="lbl2">Enviar imagem da capa</label><input type="file" id="fCapa" accept="image/*" class="field">
          <p class="small mut">Ideal: imagem vertical (proporção 2:3). Sem imagem, o site gera uma capa com o título.</p>
          <label class="lbl2">Cor da capa gerada</label><div class="swatches" id="fCores"></div>
          <label class="lbl2">Situação</label><select class="field" id="fStatus"><option value="rascunho">Rascunho (só você vê)</option><option value="publicado">Publicado (aparece no site)</option></select></div></div>
      <div class="row" style="margin-top:22px"><button class="btn accent" id="fSalvar">${novo ? "Criar livro" : "Salvar alterações"}</button><span class="small mut" id="fMsg"></span></div></div>
    <div id="capsBox"></div></div>`);
  root.append(wrap);

  $("#fStatus", wrap).value = livro.status;
  let cor = livro.cor_destaque || CORES[1];
  let capaFile = null;
  const prev = () => { $("#capaPrev", wrap).innerHTML = coverHtml({ ...livro, titulo: $("#fTitulo", wrap).value || "Título do livro", autor: $("#fAutor", wrap).value, cor_destaque: cor, capa_url: capaFile ? URL.createObjectURL(capaFile) : livro.capa_url }); };
  const drawCores = () => {
    const w = $("#fCores", wrap); w.innerHTML = "";
    CORES.forEach(c => { const b = el(`<button type="button" class="sw ${c === cor ? "on" : ""}" style="background:${c}"></button>`); b.onclick = () => { cor = c; drawCores(); prev(); }; w.append(b); });
  };
  drawCores(); prev();
  $("#fCapa", wrap).onchange = (e) => { capaFile = e.target.files[0] || null; prev(); };
  ["fTitulo", "fAutor"].forEach(k => $("#" + k, wrap).addEventListener("input", debounce(prev, 300)));

  $("#fSalvar", wrap).onclick = async () => {
    const titulo = $("#fTitulo", wrap).value.trim();
    const msg = $("#fMsg", wrap);
    if (!titulo) { msg.textContent = "Dê um título ao livro."; return; }
    msg.textContent = "Salvando…"; $("#fSalvar", wrap).disabled = true;
    try {
      const campos = { titulo, autor: $("#fAutor", wrap).value.trim(), categoria: $("#fCat", wrap).value.trim(), sinopse: $("#fSin", wrap).value.trim(), cor_destaque: cor, status: $("#fStatus", wrap).value };
      if (capaFile) campos.capa_url = await uploadImage(capaFile, "capas");
      let bid = livro.id;
      if (novo) {
        let slug = slugify(titulo), n = 1;
        for (;;) { const { data: ex } = await supabase.from("livros").select("id").eq("slug", slug).maybeSingle(); if (!ex) break; n++; slug = slugify(titulo) + "-" + n; }
        const { data, error } = await supabase.from("livros").insert({ ...campos, slug, autora_id: S.session.user.id }).select().single();
        if (error) throw error;
        bid = data.id; toast("Livro criado! Agora adicione os capítulos."); return go("/painel/livro/" + bid);
      }
      const { error } = await supabase.from("livros").update(campos).eq("id", bid);
      if (error) throw error;
      toast("Livro salvo."); go("/painel/livro/" + bid);
    } catch (e) { msg.textContent = "Erro: " + (e.message || e); $("#fSalvar", wrap).disabled = false; }
  };

  if (!novo) await drawCapitulos(wrap, livro, ctx);
}

async function drawCapitulos(wrap, livro, ctx) {
  const box = $("#capsBox", wrap);
  box.innerHTML = `<div class="box"><h2>Capítulos</h2><p class="small mut">Cada capítulo começa numa página nova no leitor. Escreva direto ou importe um PDF/Word — o texto é extraído e você revisa antes de publicar.</p>
    <div class="row wrapflex" style="margin-bottom:10px"><a class="btn accent" href="#/painel/novo-cap/${livro.id}">+ Escrever capítulo</a>
    <button class="btn" id="bImp">⬆ Importar PDF / Word / texto</button><button class="btn" id="bPubAll">Publicar todos</button>
    <a class="btn ghost" href="#/livro/${esc(livro.slug)}">Ver no site</a></div><div id="capList"><div class="loading" style="padding:30px">Carregando…</div></div></div>`;
  const { data: caps, error } = await supabase.from("capitulos").select("id,titulo,ordem,status,caracteres").eq("livro_id", livro.id).order("ordem");
  if (!ctx.alive()) return;
  const lst = $("#capList", box);
  if (error) { lst.innerHTML = `<div class="err">${esc(error.message)}</div>`; return; }
  lst.innerHTML = "";
  if (!caps.length) lst.innerHTML = `<div class="empty" style="padding:26px 0">Nenhum capítulo ainda.</div>`;
  caps.forEach((c, i) => {
    const r = el(`<div class="cap-row"><div class="ord"><button data-d="-1">▲</button><button data-d="1">▼</button></div>
      <div class="tt">${i + 1}. ${esc(c.titulo)}</div><span class="small mut">${fmtNum(c.caracteres)} car.</span>
      <span class="badge ${c.status === "publicado" ? "ok" : "warn"}">${c.status === "publicado" ? "Publicado" : "Rascunho"}</span>
      <a class="btn sm" href="#/painel/cap/${c.id}">Abrir</a><button class="btn sm danger" data-a="rm">✕</button></div>`);
    $(".tt", r).onclick = () => go("/painel/cap/" + c.id);
    $$("[data-d]", r).forEach(b => b.onclick = async () => {
      const j = i + (+b.dataset.d); if (j < 0 || j >= caps.length) return;
      const o = caps[j];
      const na = caps[i].ordem === o.ordem ? j : o.ordem, nb = caps[i].ordem === o.ordem ? i : caps[i].ordem;
      await Promise.all([supabase.from("capitulos").update({ ordem: na }).eq("id", c.id), supabase.from("capitulos").update({ ordem: nb }).eq("id", o.id)]);
      go("/painel/livro/" + livro.id);
    });
    $('[data-a="rm"]', r).onclick = async () => {
      if (!confirm(`Apagar o capítulo “${c.titulo}”?`)) return;
      const { error } = await supabase.from("capitulos").delete().eq("id", c.id);
      if (error) return toast("Erro: " + error.message); go("/painel/livro/" + livro.id);
    };
    lst.append(r);
  });
  $("#bPubAll", box).onclick = async () => {
    if (!caps.length) return toast("Não há capítulos.");
    if (!confirm("Publicar todos os capítulos deste livro?")) return;
    const { error } = await supabase.from("capitulos").update({ status: "publicado" }).eq("livro_id", livro.id);
    if (error) return toast("Erro: " + error.message);
    if (livro.status !== "publicado" && confirm("O livro ainda está como rascunho. Publicar o livro também (aparecer no site)?")) await supabase.from("livros").update({ status: "publicado" }).eq("id", livro.id);
    toast("Publicado."); go("/painel/livro/" + livro.id);
  };
  $("#bImp", box).onclick = () => openImportWizard(livro, caps);
}

/* ---------------- importar livro (PDF / Word / texto) ---------------- */
function openImportWizard(livro, caps) {
  const back = el(`<div class="modal-back"><div class="modal-card" style="background:var(--paper);padding:26px;max-width:640px">
    <h2 style="font-family:var(--f-display);margin:0 0 4px">Importar arquivo</h2>
    <p class="small mut">PDF, Word (.docx) ou texto. O texto é extraído aqui no navegador — nada é enviado a terceiros.</p>
    <div id="wBody"><label class="upload" id="drop" style="display:block;cursor:pointer">📄 Clique para escolher o arquivo<br><span class="small">ou arraste para cá</span>
      <input type="file" id="wFile" accept=".pdf,.docx,.txt,.md,application/pdf" style="display:none"></label></div>
    <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" id="wFechar">Fechar</button></div></div></div>`);
  document.body.append(back);
  const close = () => back.remove();
  $("#wFechar", back).onclick = close;
  back.onclick = (e) => { if (e.target === back) close(); };
  const body = $("#wBody", back);
  const drop = $("#drop", back);
  ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", e => { if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]); });
  $("#wFile", back).onchange = (e) => { if (e.target.files[0]) handle(e.target.files[0]); };

  async function handle(file) {
    body.innerHTML = `<p><b>${esc(file.name)}</b></p><div class="bar-prog"><i id="wBar"></i></div><p class="small mut" id="wTxt">Lendo o arquivo…</p>`;
    let r;
    try {
      r = await extractFromFile(file, (p, n) => { $("#wBar", back).style.width = (p / n * 100) + "%"; $("#wTxt", back).textContent = `Extraindo texto — página ${p} de ${n}`; });
    } catch (e) { body.innerHTML = `<div class="err">${esc(e.message || e)}</div>`; return; }
    if (!r.text) { body.innerHTML = `<div class="err">Não encontrei texto neste arquivo. ${esc(r.aviso || "")}</div>`; return; }
    const base = file.name.replace(/\.[^.]+$/, "");
    const detected = splitChapters(r.text, base);
    const mult = detected.length > 1;
    let modo = mult ? "auto" : "um";
    const draw = () => {
      const list = modo === "auto" ? detected : [{ titulo: base, conteudo: r.text }];
      body.innerHTML = `<p class="small">Extraí <b>${fmtNum(r.text.length)}</b> caracteres (≈ ${fmtNum(wordCount(r.text))} palavras)${r.pages ? " de " + r.pages + " páginas" : ""}.</p>
        ${r.aviso ? `<div class="err" style="margin:8px 0">${esc(r.aviso)}</div>` : ""}
        <div class="row wrapflex" style="margin:10px 0"><label><input type="radio" name="modo" value="auto" ${modo === "auto" ? "checked" : ""} ${mult ? "" : "disabled"}> Dividir em capítulos ${mult ? `(encontrei ${detected.length})` : "(não encontrei “Capítulo N”)"}</label>
        <label><input type="radio" name="modo" value="um" ${modo === "um" ? "checked" : ""}> Um capítulo só</label></div>
        <div style="max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:6px 12px" id="wList"></div>
        <div class="row" style="margin-top:14px"><button class="btn accent" id="wCriar">Criar ${list.length} capítulo${list.length > 1 ? "s" : ""} (rascunho)</button><span class="small mut" id="wMsg"></span></div>`;
      const wl = $("#wList", body);
      list.forEach((c, i) => {
        const row = el(`<div class="cap-row"><span class="small mut">${i + 1}</span><input class="field" value="${esc(c.titulo)}" data-i="${i}"><span class="small mut">${fmtNum(c.conteudo.length)} car.</span></div>`);
        $("input", row).oninput = (e) => { c.titulo = e.target.value; };
        wl.append(row);
      });
      $$('input[name="modo"]', body).forEach(x => x.onchange = () => { modo = x.value; draw(); });
      $("#wCriar", body).onclick = async () => {
        $("#wCriar", body).disabled = true; $("#wMsg", body).textContent = "Criando…";
        const base0 = caps.length ? Math.max(...caps.map(c => c.ordem)) + 1 : 0;
        const rows = list.map((c, i) => ({ livro_id: livro.id, titulo: (c.titulo || `Capítulo ${i + 1}`).trim(), conteudo: c.conteudo, caracteres: c.conteudo.length, ordem: base0 + i, status: "rascunho" }));
        for (let k = 0; k < rows.length; k += 20) {
          const { error } = await supabase.from("capitulos").insert(rows.slice(k, k + 20));
          if (error) { $("#wMsg", body).textContent = "Erro: " + error.message; $("#wCriar", body).disabled = false; return; }
        }
        close(); toast(`${rows.length} capítulo(s) criado(s). Abra cada um para revisar com a IA e publicar.`, 4200);
        go("/painel/livro/" + livro.id);
      };
    };
    draw();
  }
}

/* ---------------- editor de capítulo ---------------- */
async function reviewChunk(texto) {
  if (MOCK) {
    await new Promise(r => setTimeout(r, 500));
    const subs = [["voçe", "você", "Acentuação"], ["concerteza", "com certeza", "Escrita correta: duas palavras"], ["ahi", "aí", "Forma correta"], ["mais ou menos", "aproximadamente", "Registro mais formal"]];
    const sugestoes = subs.filter(([a]) => texto.includes(a)).map(([a, b, m]) => ({ trecho_original: a, sugestao: b, motivo: m }));
    return { comentario_geral: "Texto claro e bem conduzido (simulação local).", sugestoes };
  }
  const { data: sess } = await supabase.auth.getSession();
  for (let tent = 0; tent < 3; tent++) {
    const resp = await fetch("/api/revisar", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + sess.session.access_token }, body: JSON.stringify({ texto }) });
    const json = await resp.json().catch(() => ({}));
    if (resp.ok) return json;
    if (![429, 500, 502, 503].includes(resp.status) || tent === 2) throw new Error(json.erro || "Falha na revisão (" + resp.status + ")");
    await new Promise(r => setTimeout(r, 4000 * (tent + 1)));
  }
}

export async function viewCapEd({ id, livroId }, ctx) {
  if (!guard()) return;
  const root = app();
  root.append(adminNav());
  let cap = null, livro = null;
  if (id) {
    const { data } = await supabase.from("capitulos").select("*").eq("id", id).maybeSingle();
    if (!ctx.alive()) return;
    if (!data) { root.append(el(`<div class="adm"><div class="err">Capítulo não encontrado.</div><p><a class="btn" href="#/painel">Voltar</a></p></div>`)); return; }
    cap = data; livroId = cap.livro_id;
  }
  const { data: lv } = await supabase.from("livros").select("*").eq("id", livroId).maybeSingle();
  if (!ctx.alive()) return;
  livro = lv;
  if (!livro) { root.append(el(`<div class="adm"><div class="err">Livro não encontrado.</div></div>`)); return; }

  const dkey = "lf_draft_" + (cap ? cap.id : "novo_" + livro.id);
  const wrap = el(`<div class="adm"><a class="small" href="#/painel/livro/${livro.id}">← ${esc(livro.titulo)}</a>
    <h1>${cap ? "Editar capítulo" : "Novo capítulo"}</h1>
    <div id="rascunho"></div>
    <div class="box"><div class="step"><div class="num">1</div><div class="body">
      <h2>Escreva ou importe o texto</h2>
      <label class="lbl2" style="margin-top:0">Título do capítulo</label><input class="field" id="cTitulo" value="${esc(cap ? cap.titulo : "")}" placeholder="Ex.: Capítulo 1 – No princípio">
      <div class="row wrapflex" style="margin:14px 0 8px"><button class="btn" id="cImp">⬆ Importar PDF / Word / texto</button>
        <input type="file" id="cFile" accept=".pdf,.docx,.txt,.md,application/pdf" style="display:none"><span class="small mut" id="cCnt"></span><span class="spacer"></span>
        <button class="btn sm" id="cVer">Ver como o leitor verá</button></div>
      <div id="cImpMsg" class="small mut"></div>
      <textarea class="field" id="cTexto" rows="18" placeholder="Escreva aqui ou cole o texto. Cada linha vira um parágrafo. Use ## para subtítulos, ** ** para negrito e * * para itálico.">${esc(cap ? cap.conteudo : "")}</textarea>
    </div></div></div>
    <div class="box"><div class="step"><div class="num">2</div><div class="body">
      <h2>Revisão com a IA</h2><p class="small mut">A IA só <b>sugere</b> correções de gramática, ortografia e clareza — nunca muda o sentido nem publica sozinha. Você decide o que aceitar.</p>
      <button class="btn dark" id="cRev">✨ Revisar texto com a IA</button>
      <div class="bar-prog hidden" id="rBarW"><i id="rBar"></i></div><div class="small mut" id="rTxt" style="margin-top:6px"></div>
      <div id="rRes"></div></div></div></div>
    <div class="box"><div class="step"><div class="num">3</div><div class="body">
      <h2>Salvar e publicar</h2><div id="pubAviso"></div>
      <div class="row wrapflex"><button class="btn" id="cSalvar">Salvar rascunho</button><button class="btn accent" id="cPub">${cap && cap.status === "publicado" ? "Salvar (já publicado)" : "Publicar capítulo"}</button>
        ${cap ? `<a class="btn ghost" href="#/ler/${esc(livro.slug)}/${cap.id}">Ver no leitor</a>` : ""}</div>
      <p class="small mut" id="cMsg" style="margin-top:10px"></p></div></div></div></div>`);
  root.append(wrap);

  const ta = $("#cTexto", wrap), ti = $("#cTitulo", wrap);
  let revisado = false;
  const upCnt = () => { $("#cCnt", wrap).textContent = `${fmtNum(wordCount(ta.value))} palavras · ${fmtNum(ta.value.length)} caracteres`; };
  upCnt();

  // rascunho local (protege contra perder textos longos)
  const draft = store.get(dkey, null);
  if (draft && draft.c && draft.c !== (cap ? cap.conteudo : "")) {
    const b = el(`<div class="box" style="border-color:var(--accent)"><b>Há um texto não salvo neste aparelho</b> (${new Date(draft.ts).toLocaleString("pt-BR")}).
      <div class="row" style="margin-top:10px"><button class="btn sm accent" id="dRest">Restaurar</button><button class="btn sm" id="dDesc">Descartar</button></div></div>`);
    $("#rascunho", wrap).append(b);
    $("#dRest", b).onclick = () => { ta.value = draft.c; ti.value = draft.t || ti.value; upCnt(); b.remove(); };
    $("#dDesc", b).onclick = () => { store.del(dkey); b.remove(); };
  }
  const auto = debounce(() => { store.set(dkey, { t: ti.value, c: ta.value, ts: Date.now() }); upCnt(); }, 700);
  ta.addEventListener("input", auto); ti.addEventListener("input", auto);

  if (livro.status !== "publicado") {
    $("#pubAviso", wrap).innerHTML = `<div class="err" style="background:#fff7e6;border-color:#e5cf9d;color:#7a5410;margin-bottom:12px">O livro “${esc(livro.titulo)}” ainda é <b>rascunho</b> — os leitores só veem o capítulo quando o livro também estiver publicado.
      <button class="btn sm" id="pubLivro" style="margin-left:8px">Publicar o livro</button></div>`;
    $("#pubLivro", wrap).onclick = async () => { const { error } = await supabase.from("livros").update({ status: "publicado" }).eq("id", livro.id); if (error) return toast("Erro: " + error.message); livro.status = "publicado"; $("#pubAviso", wrap).innerHTML = ""; toast("Livro publicado."); };
  }

  // importar texto para este capítulo
  $("#cImp", wrap).onclick = () => $("#cFile", wrap).click();
  $("#cFile", wrap).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const m = $("#cImpMsg", wrap); m.textContent = "Lendo o arquivo…";
    try {
      const r = await extractFromFile(f, (p, n) => { m.textContent = `Extraindo texto — página ${p} de ${n}`; });
      if (!r.text) { m.innerHTML = `<span style="color:#b2402f">Não encontrei texto. ${esc(r.aviso || "")}</span>`; return; }
      if (ta.value.trim() && !confirm("Já existe texto aqui. OK = substituir pelo arquivo; Cancelar = acrescentar no final.")) ta.value = ta.value.trim() + "\n\n" + r.text;
      else ta.value = r.text;
      if (!ti.value.trim()) ti.value = f.name.replace(/\.[^.]+$/, "");
      m.textContent = "Texto importado. Confira abaixo, depois rode a revisão da IA." + (r.aviso ? " " + r.aviso : "");
      auto(); upCnt();
    } catch (err) { m.innerHTML = `<span style="color:#b2402f">${esc(err.message || err)}</span>`; }
    e.target.value = "";
  };

  $("#cVer", wrap).onclick = () => {
    import("./util.js").then(({ mdToHtml }) => {
      const b = el(`<div class="modal-back"><div class="modal-card" style="background:var(--paper);padding:30px;max-width:760px"><div class="rd-text" style="max-height:70vh;overflow:auto">${mdToHtml("# " + ti.value + "\n" + ta.value)}</div>
        <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" id="pvx">Fechar</button></div></div></div>`);
      $("#pvx", b).onclick = () => b.remove(); b.onclick = (e) => { if (e.target === b) b.remove(); };
      document.body.append(b);
    });
  };

  // revisão IA
  $("#cRev", wrap).onclick = async () => {
    const texto = ta.value.trim();
    if (!texto) return toast("Escreva ou importe o texto primeiro.");
    const btn = $("#cRev", wrap), res = $("#rRes", wrap), bw = $("#rBarW", wrap), bar = $("#rBar", wrap), tx = $("#rTxt", wrap);
    btn.disabled = true; res.innerHTML = ""; bw.classList.remove("hidden"); bar.style.width = "4%";
    const chunks = chunkForReview(texto, 9000);
    const sugs = []; let comentario = "";
    try {
      for (let k = 0; k < chunks.length; k++) {
        tx.textContent = `Revisando parte ${k + 1} de ${chunks.length}…`; bar.style.width = ((k) / chunks.length * 100 + 4) + "%";
        const r = await reviewChunk(chunks[k]);
        if (!comentario) comentario = r.comentario_geral || "";
        sugs.push(...(r.sugestoes || []));
      }
      bar.style.width = "100%"; tx.textContent = ""; revisado = true;
      drawSugestoes(res, sugs, comentario, ta, auto, upCnt);
    } catch (e) { tx.innerHTML = `<span style="color:#b2402f">Não consegui revisar agora: ${esc(e.message || e)}. Tente de novo em instantes.</span>`; }
    btn.disabled = false; setTimeout(() => bw.classList.add("hidden"), 600);
  };

  // salvar
  async function salvar(status) {
    const titulo = ti.value.trim(), conteudo = ta.value;
    const msg = $("#cMsg", wrap);
    if (!titulo) { msg.textContent = "Dê um título ao capítulo."; return; }
    if (status === "publicado" && !revisado && !confirm("Você ainda não revisou este texto com a IA. Publicar mesmo assim?")) return;
    msg.textContent = "Salvando…";
    const campos = { titulo, conteudo, caracteres: conteudo.length };
    if (status) campos.status = status;
    try {
      if (cap) {
        const { error } = await supabase.from("capitulos").update(campos).eq("id", cap.id);
        if (error) throw error;
      } else {
        const { data: last } = await supabase.from("capitulos").select("ordem").eq("livro_id", livro.id).order("ordem", { ascending: false }).limit(1);
        const ordem = last && last[0] ? last[0].ordem + 1 : 0;
        const { data, error } = await supabase.from("capitulos").insert({ ...campos, livro_id: livro.id, ordem, status: status || "rascunho" }).select().single();
        if (error) throw error;
        store.del(dkey); toast(status === "publicado" ? "Capítulo publicado!" : "Rascunho salvo.");
        return go("/painel/cap/" + data.id);
      }
      store.del(dkey);
      toast(status === "publicado" ? "Capítulo publicado!" : "Rascunho salvo.");
      msg.textContent = "Salvo às " + new Date().toLocaleTimeString("pt-BR");
      if (status === "publicado") cap.status = "publicado";
    } catch (e) { msg.textContent = "Erro: " + (e.message || e); }
  }
  $("#cSalvar", wrap).onclick = () => salvar(null);
  $("#cPub", wrap).onclick = () => salvar("publicado");
}

function drawSugestoes(res, sugs, comentario, ta, auto, upCnt) {
  res.innerHTML = `${comentario ? `<p style="margin:14px 0 4px"><b>IA:</b> ${esc(comentario)}</p>` : ""}`;
  if (!sugs.length) { res.innerHTML += `<div class="small" style="color:#2f7d4f;margin-top:8px">✔ Nenhuma correção sugerida — o texto está bem escrito.</div>`; return; }
  const head = el(`<div class="row wrapflex" style="margin:12px 0 4px"><b>${sugs.length} sugest${sugs.length > 1 ? "ões" : "ão"}</b><span class="spacer"></span><button class="btn sm" id="sAll">Aceitar todas</button></div>`);
  res.append(head);
  const list = el(`<div></div>`); res.append(list);
  const aceitar = (s, card) => {
    if (ta.value.includes(s.trecho_original)) { ta.value = ta.value.replace(s.trecho_original, s.sugestao); auto(); upCnt(); card.remove(); return true; }
    toast("Não achei o trecho exato — ajuste manualmente."); return false;
  };
  const cards = [];
  sugs.forEach(s => {
    const card = el(`<div class="sug"><div class="de">${esc(s.trecho_original)}</div><div class="para">→ ${esc(s.sugestao)}</div>${s.motivo ? `<div class="mo">${esc(s.motivo)}</div>` : ""}
      <div class="acts"><button class="btn sm accent" data-a="ok">Aceitar</button><button class="btn sm" data-a="no">Ignorar</button></div></div>`);
    $('[data-a="ok"]', card).onclick = () => aceitar(s, card);
    $('[data-a="no"]', card).onclick = () => card.remove();
    cards.push([s, card]); list.append(card);
  });
  $("#sAll", head).onclick = () => { let n = 0; cards.forEach(([s, c]) => { if (c.isConnected && aceitar(s, c)) n++; }); toast(n + " correção(ões) aplicada(s)."); };
}

/* ---------------- aparência ---------------- */
export async function viewAparencia() {
  if (!guard()) return;
  const root = app();
  root.append(adminNav());
  const c = S.config;
  const wrap = el(`<div class="adm"><h1>Aparência do site</h1><p class="mut">O que você mudar aqui vale para todos os leitores.</p>${tabs("aparencia")}
    <div class="box"><h2>Identidade</h2>
      <label class="lbl2">Nome do site</label><input class="field" id="aNome" value="${esc(c.nome_site || "")}">
      <label class="lbl2">Frase abaixo do título (subtítulo)</label><input class="field" id="aSub" value="${esc(c.subtitulo || "")}">
      <label class="lbl2">Cor principal</label><div class="swatches" id="aCores"></div>
      <label class="lbl2">Tema padrão dos leitores</label><div class="row"><button class="btn sm" data-t="claro">Claro</button><button class="btn sm" data-t="sepia">Sépia</button><button class="btn sm" data-t="noturno">Noturno</button></div>
      <p class="small mut">Cada leitor pode trocar o tema dele no próprio aparelho; isto só mostra como fica.</p></div>
    <div class="box"><h2>Chamada da página inicial</h2>
      <label class="lbl2">Linha 1</label><input class="field" id="aL1" value="${esc(c.hero_linha1 || "")}">
      <label class="lbl2">Linha 2 (em destaque, colorida)</label><input class="field" id="aL2" value="${esc(c.hero_linha2 || "")}">
      <label class="lbl2">Frase curta em itálico</label><input class="field" id="aFr" value="${esc(c.hero_frase || "")}"></div>
    <div class="box"><h2>Sobre a autora</h2>
      <label class="lbl2">Nome da autora</label><input class="field" id="aAutora" value="${esc(c.autora_nome || "")}">
      <label class="lbl2">Biografia</label><textarea class="field" id="aBio" rows="5">${esc(c.bio_autora || "")}</textarea>
      <label class="lbl2">Foto</label><div class="row"><div id="aFotoPrev" style="width:80px;height:80px;border-radius:50%;background:var(--cream) center/cover"></div><input type="file" id="aFoto" accept="image/*" class="field"></div></div>
    <button class="btn accent" id="aSalvar">Salvar aparência</button> <span class="small mut" id="aMsg"></span></div>`);
  root.append(wrap);
  let cor = c.cor_primaria || CORES[0], fotoFile = null;
  if (c.foto_autora_url) $("#aFotoPrev", wrap).style.backgroundImage = `url('${c.foto_autora_url}')`;
  const drawC = () => {
    const w = $("#aCores", wrap); w.innerHTML = "";
    CORES.forEach(k => { const b = el(`<button type="button" class="sw ${k === cor ? "on" : ""}" style="background:${k}"></button>`); b.onclick = () => { cor = k; document.documentElement.style.setProperty("--accent", cor); drawC(); }; w.append(b); });
    const pick = el(`<input type="color" value="${cor}" title="Outra cor" style="width:34px;height:34px;border:0;background:none;padding:0">`);
    pick.oninput = () => { cor = pick.value; document.documentElement.style.setProperty("--accent", cor); }; w.append(pick);
  };
  drawC();
  $$("[data-t]", wrap).forEach(b => b.onclick = () => applyTema(b.dataset.t));
  $("#aFoto", wrap).onchange = (e) => { fotoFile = e.target.files[0] || null; if (fotoFile) $("#aFotoPrev", wrap).style.backgroundImage = `url('${URL.createObjectURL(fotoFile)}')`; };
  $("#aSalvar", wrap).onclick = async () => {
    const msg = $("#aMsg", wrap); msg.textContent = "Salvando…";
    try {
      const patch = {
        nome_site: $("#aNome", wrap).value.trim() || "Letras de Fé", subtitulo: $("#aSub", wrap).value.trim(),
        hero_linha1: $("#aL1", wrap).value.trim(), hero_linha2: $("#aL2", wrap).value.trim(), hero_frase: $("#aFr", wrap).value.trim(),
        autora_nome: $("#aAutora", wrap).value.trim(), bio_autora: $("#aBio", wrap).value.trim(), cor_primaria: cor,
      };
      if (fotoFile) patch.foto_autora_url = await uploadImage(fotoFile, "autora");
      const { error } = await supabase.from("config_site").update(patch).eq("id", 1);
      if (error) throw error;
      await carregarConfig(); applyConfig(S.config);
      msg.textContent = ""; toast("Aparência salva.");
    } catch (e) { msg.textContent = "Erro: " + (e.message || e); }
  };
}
