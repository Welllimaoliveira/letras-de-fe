import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://shttflskmphdiivjgayy.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_I1R6eFMtC7lc4wdxpvV7_Q_3UoOgqNq";

/** ?mock=1 (leitor) ou ?mock=admin (autora) — só funciona em localhost, serve pra testar sem banco. */
const q = new URLSearchParams(location.search);
export const MOCK = ["localhost", "127.0.0.1"].includes(location.hostname) && q.has("mock") ? (q.get("mock") || "1") : null;

export let supabase = null;

export async function initSupabase() {
  if (MOCK) {
    const m = await import("../dev/mock.js");
    supabase = m.createMock(MOCK === "admin");
  } else {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return supabase;
}

/** Estado compartilhado do app. */
export const S = { session: null, profile: null, config: {} };

export async function carregarProfile(session) {
  S.session = session || null;
  if (!session) { S.profile = null; return null; }
  const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  S.profile = data && data.role === "autora" ? data : null;
  return S.profile;
}

export async function carregarConfig() {
  const { data } = await supabase.from("config_site").select("*").eq("id", 1).maybeSingle();
  S.config = data || {};
  return S.config;
}
