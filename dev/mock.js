// Banco simulado em memória — SÓ para testar a interface localmente
// (http://localhost:PORT/?mock=1 = leitor, ?mock=admin = autora logada).
// Nunca é carregado em produção (supabase.js só importa isto em localhost com ?mock).

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const now = () => new Date().toISOString();

const LOREM = [
  "No princípio, a Palavra já existia, e a Palavra estava com Deus. Tudo o que foi feito, foi feito por meio dela, e sem ela nada do que existe teria vindo a ser.",
  "Voçe pode caminhar em paz quando entende que a graça não é um prêmio, mas um presente. Concerteza esse é o ponto central de toda a jornada que vamos percorrer juntos nestas páginas.",
  "A fé não elimina as perguntas; ela nos ensina a caminhar com elas. Há dias de luz clara e dias de névoa, e em ambos o Pastor segue à frente, conhecendo cada curva do caminho que ainda não vimos.",
  "Orar é mais do que pedir: é aprender a escutar. No silêncio, as palavras que antes pareciam tão urgentes perdem o volume, e uma voz mansa, que sempre esteve ali, se torna finalmente audível.",
  "Ahi começa a verdadeira transformação — não no grande gesto, mas na pequena fidelidade de cada manhã, no copo de água oferecido, na palavra gentil dita sem plateia, no perdão concedido antes de ser pedido.",
];
function texto(paragrafos) {
  const out = [];
  for (let i = 0; i < paragrafos; i++) out.push(LOREM[i % LOREM.length] + " " + LOREM[(i + 2) % LOREM.length]);
  return out.join("\n");
}

export function createMock(admin) {
  const user = { id: "u-mock", email: "autora@teste.local" };
  const db = {
    profiles: admin ? [{ id: user.id, email: user.email, nome: "Autora (teste)", role: "autora" }] : [],
    config_site: [{ id: 1, nome_site: "Letras de Fé", subtitulo: "Reflexões e escritos sobre a Palavra", bio_autora: "Escrevo para encorajar quem caminha na fé, com simplicidade e esperança.", foto_autora_url: null, cor_primaria: "#b5532b", cor_fundo: "#faf8f3", fonte_leitura: "serif", autora_nome: "Lúcia de Lima de Oliveira", hero_linha1: "Palavras que", hero_linha2: "alimentam a alma", hero_frase: "Leia. Medite. Compartilhe." }],
    livros: [], capitulos: [],
  };
  const l1 = { id: "l1", autora_id: user.id, titulo: "Caminhando com o Pastor", slug: "caminhando-com-o-pastor", autor: "Lúcia de Lima de Oliveira", categoria: "Devocional", sinopse: "Meditações curtas sobre o cuidado de Deus nos dias comuns.", capa_url: null, cor_destaque: "#8a4a2b", status: "publicado", ordem: 0, leituras: 12, created_at: now() };
  const l2 = { id: "l2", autora_id: user.id, titulo: "Salmos para a Madrugada", slug: "salmos-para-a-madrugada", autor: "Lúcia de Lima de Oliveira", categoria: "Poesia", sinopse: "Poemas inspirados nos Salmos.", capa_url: null, cor_destaque: "#3f6b8c", status: "publicado", ordem: 1, leituras: 3, created_at: now() };
  const l3 = { id: "l3", autora_id: user.id, titulo: "Rascunho em andamento", slug: "rascunho-em-andamento", autor: "Lúcia de Lima de Oliveira", categoria: "Estudo bíblico", sinopse: "", capa_url: null, cor_destaque: "#4c6b54", status: "rascunho", ordem: 2, leituras: 0, created_at: now() };
  db.livros.push(l1, l2, l3);
  const cap = (id, livro_id, titulo, ordem, par, status = "publicado") => { const c = texto(par); db.capitulos.push({ id, livro_id, titulo, conteudo: c, ordem, status, caracteres: c.length, created_at: now() }); };
  cap("c1", "l1", "A voz do Pastor", 0, 14); cap("c2", "l1", "Vales e pastos", 1, 10); cap("c3", "l1", "Casa para sempre", 2, 6, "rascunho");
  cap("c4", "l2", "Salmo da aurora", 0, 4);

  const files = {};
  const session = admin ? { access_token: "mock", user } : null;
  const listeners = [];

  function visible(table, rows) {
    if (admin) return rows;
    if (table === "livros") return rows.filter(r => r.status === "publicado");
    if (table === "capitulos") return rows.filter(r => r.status === "publicado" && db.livros.some(l => l.id === r.livro_id && l.status === "publicado"));
    if (table === "profiles") return [];
    return rows;
  }

  function from(table) {
    const st = { op: "select", filters: [], orders: [], limit: null, single: false, maybe: false, payload: null, wantRows: false };
    const exec = () => {
      const all = db[table];
      if (!all) return { data: null, error: { message: "tabela inexistente: " + table } };
      const match = (r) => st.filters.every(f => f(r));
      if (st.op === "select") {
        let rows = visible(table, all).filter(match).map(r => ({ ...r }));
        if (st.orders.length) rows.sort((a, b) => { for (const [c, asc] of st.orders) { const d = (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1); if (d) return d; } return 0; });
        if (st.limit != null) rows = rows.slice(0, st.limit);
        if (st.single) return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "Linha não encontrada" } };
        if (st.maybe) return { data: rows[0] || null, error: null };
        return { data: rows, error: null };
      }
      if (!admin) return { data: null, error: { message: "permissão negada (mock: não é autora)" } };
      if (st.op === "insert") {
        const created = st.payload.map(p => {
          const defaults = table === "livros" ? { status: "rascunho", ordem: 0, leituras: 0, sinopse: "" } : table === "capitulos" ? { status: "rascunho", ordem: 0, caracteres: 0, conteudo: "" } : {};
          const row = { id: uid(), created_at: now(), ...defaults, ...p };
          all.push(row); return { ...row };
        });
        if (!st.wantRows) return { data: null, error: null };
        if (st.single) return { data: created[0], error: null };
        return { data: created, error: null };
      }
      if (st.op === "update") { all.filter(match).forEach(r => Object.assign(r, st.payload)); return { data: null, error: null }; }
      if (st.op === "delete") {
        for (let i = all.length - 1; i >= 0; i--) if (match(all[i])) all.splice(i, 1);
        if (table === "livros") db.capitulos = db.capitulos.filter(c => db.livros.some(l => l.id === c.livro_id));
        return { data: null, error: null };
      }
      return { data: null, error: null };
    };
    const b = {
      select() { st.wantRows = true; return b; },
      insert(p) { st.op = "insert"; st.payload = Array.isArray(p) ? p : [p]; return b; },
      update(p) { st.op = "update"; st.payload = p; return b; },
      delete() { st.op = "delete"; return b; },
      eq(c, v) { st.filters.push(r => r[c] === v); return b; },
      order(c, o) { st.orders.push([c, !(o && o.ascending === false)]); return b; },
      limit(n) { st.limit = n; return b; },
      single() { st.single = true; return b; },
      maybeSingle() { st.maybe = true; return b; },
      then(res, rej) { return Promise.resolve().then(exec).then(res, rej); },
    };
    return b;
  }

  return {
    from,
    rpc: async (name, args) => { if (name === "registrar_leitura") { const l = db.livros.find(x => x.id === args.p_livro); if (l) l.leituras++; } return { data: null, error: null }; },
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (cb) => { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword: async () => ({ data: { session: { access_token: "mock", user } }, error: null }),
      signUp: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null }),
    },
    storage: { from: () => ({
      upload: async (path, file) => { files[path] = file; return { data: { path }, error: null }; },
      getPublicUrl: (path) => ({ data: { publicUrl: files[path] ? URL.createObjectURL(files[path]) : "" } }),
    }) },
  };
}
