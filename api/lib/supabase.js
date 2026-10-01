// Verificação de identidade no servidor, sem precisar do pacote
// @supabase/supabase-js (fetch puro contra a API REST do Supabase).
// Usa a SERVICE ROLE KEY — só existe aqui, nunca no navegador.

export async function getAutoraFromRequest(req) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas no servidor.");
  }

  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;

  // 1) quem é o usuário desse token?
  const userResp = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  });
  if (!userResp.ok) return null;
  const user = await userResp.json();
  if (!user || !user.id) return null;

  // 2) ele tem profile com role='autora'? (service role ignora RLS)
  const profResp = await fetch(
    `${url}/rest/v1/profiles?id=eq.${user.id}&select=id,role,nome`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  if (!profResp.ok) return null;
  const rows = await profResp.json();
  const profile = rows[0];
  if (!profile || profile.role !== "autora") return null;

  return { id: user.id, email: user.email, nome: profile.nome };
}
