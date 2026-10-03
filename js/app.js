import { initSupabase, supabase, S, carregarProfile, carregarConfig } from "./supabase.js";
import { route, startRouter, go, app } from "./router.js";
import { store, $ } from "./util.js";
import { applyTema, viewHome, viewLivro, viewLer } from "./views-public.js";
import { viewEntrar, viewPainel, viewLivroEd, viewCapEd, viewAparencia, applyConfig } from "./views-admin.js";

applyTema(store.get("lf_tema", "claro"));

async function boot() {
  const root = app();
  root.innerHTML = `<div class="loading">Carregando…</div>`;
  try {
    await initSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    await Promise.all([carregarConfig(), carregarProfile(session)]);
    applyConfig(S.config);
    supabase.auth.onAuthStateChange((evt, sess) => {
      if (evt === "SIGNED_OUT") { S.profile = null; S.session = null; }
      else if (evt === "TOKEN_REFRESHED") S.session = sess;
    });
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="wrap" style="padding:70px 24px"><div class="err"><b>Não consegui conectar ao banco de dados.</b><br>${String(e.message || e).replace(/</g, "&lt;")}
      <p><button class="btn dark" onclick="location.reload()">Tentar de novo</button></p></div></div>`;
    return;
  }

  route("/", viewHome);
  route("/livro/:slug", viewLivro);
  route("/ler/:slug/:capId?", viewLer);
  route("/entrar", viewEntrar);
  route("/painel", viewPainel);
  route("/painel/aparencia", viewAparencia);
  route("/painel/livro/:id", viewLivroEd);
  route("/painel/cap/:id", (p, c) => viewCapEd({ id: p.id }, c));
  route("/painel/novo-cap/:livroId", (p, c) => viewCapEd({ livroId: p.livroId }, c));
  await startRouter();
}

boot();
