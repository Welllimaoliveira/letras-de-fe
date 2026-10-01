// Chamada ao Gemini para revisão de texto. A chave só existe aqui
// (variável de ambiente da Vercel) — o navegador nunca a vê.

const MODELO_GEMINI = "gemini-flash-latest";

const SCHEMA_SUGESTOES = {
  type: "OBJECT",
  properties: {
    comentario_geral: { type: "STRING" },
    sugestoes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          trecho_original: { type: "STRING" },
          sugestao: { type: "STRING" },
          motivo: { type: "STRING" },
        },
        required: ["trecho_original", "sugestao", "motivo"],
      },
    },
  },
  required: ["comentario_geral", "sugestoes"],
};

export async function revisarTexto(texto) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada no servidor.");

  const prompt = `
Você é um revisor de texto cuidadoso. Vai revisar um trecho escrito por uma autora
sobre temas bíblicos/cristãos, para publicação num site pessoal dela.

REGRAS IMPORTANTES:
- Revise SOMENTE gramática, ortografia, pontuação, clareza e coesão.
- NÃO reescreva o texto inteiro. NÃO mude o sentido teológico, a opinião ou a voz da autora.
- NÃO invente versículos, referências bíblicas ou citações que não estejam no texto.
- Se um trecho já está bom, não sugira nada sobre ele.
- Liste cada sugestão separadamente: o trecho original exato, a sugestão de troca, e o motivo (curto).
- Se o texto estiver todo bem, devolva uma lista de sugestões vazia e diga isso no comentário geral.
- "comentario_geral" deve ter no máximo 2 frases, tom gentil e encorajador.

TEXTO PARA REVISAR:
"""
${texto}
"""

Retorne somente JSON no formato do schema.
`;

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    `${MODELO_GEMINI}:generateContent?key=${apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseSchema: SCHEMA_SUGESTOES,
      },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Gemini respondeu ${resp.status}: ${body.slice(0, 300)}`);
  }

  const data = await resp.json();
  const cand = (data.candidates || [])[0];
  if (!cand) throw new Error("Gemini não retornou candidatos.");
  if (cand.finishReason === "MAX_TOKENS") throw new Error("Texto longo demais para revisar de uma vez.");

  const text = (cand.content?.parts || [])[0]?.text;
  if (!text) throw new Error("Gemini retornou resposta vazia.");

  const parsed = JSON.parse(text);
  return {
    comentario_geral: String(parsed.comentario_geral || "").trim(),
    sugestoes: Array.isArray(parsed.sugestoes)
      ? parsed.sugestoes
          .filter((s) => s && s.trecho_original && s.sugestao)
          .map((s) => ({
            trecho_original: String(s.trecho_original).trim(),
            sugestao: String(s.sugestao).trim(),
            motivo: String(s.motivo || "").trim(),
          }))
      : [],
  };
}
