// Chamada ao Gemini para revisão de texto. A chave só existe aqui
// (variável de ambiente da Vercel) — o navegador nunca a vê.

const MODELOS = ["gemini-flash-latest", "gemini-2.5-flash"];

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

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function chamar(modelo, apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: SCHEMA_SUGESTOES,
      },
    }),
  });
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => "");
    const e = new Error(`Gemini respondeu ${resp.status}: ${corpo.slice(0, 200)}`);
    e.status = resp.status;
    throw e;
  }
  return resp.json();
}

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
- "trecho_original" deve ser copiado EXATAMENTE como está no texto (curto: a frase ou expressão com o problema).
- "sugestao" é o mesmo trecho já corrigido; "motivo" explica em poucas palavras.
- No máximo 40 sugestões, priorizando as mais importantes.
- Se o texto estiver todo bem, devolva a lista de sugestões vazia e diga isso no comentário geral.
- "comentario_geral" deve ter no máximo 2 frases, tom gentil e encorajador.

TEXTO PARA REVISAR:
"""
${texto}
"""

Retorne somente JSON no formato do schema.
`;

  let ultimoErro;
  // 2 modelos x 3 tentativas, com espera crescente quando o Gemini está sobrecarregado (429/503)
  for (const modelo of MODELOS) {
    for (let tent = 0; tent < 3; tent++) {
      try {
        const data = await chamar(modelo, apiKey, prompt);
        const cand = (data.candidates || [])[0];
        if (!cand) throw new Error("Gemini não retornou candidatos.");
        if (cand.finishReason === "MAX_TOKENS") throw new Error("Trecho longo demais para revisar de uma vez.");
        const text = (cand.content?.parts || [])[0]?.text;
        if (!text) throw new Error("Gemini retornou resposta vazia.");
        const parsed = JSON.parse(text);
        return {
          comentario_geral: String(parsed.comentario_geral || "").trim(),
          sugestoes: Array.isArray(parsed.sugestoes)
            ? parsed.sugestoes
                .filter((s) => s && s.trecho_original && s.sugestao && s.trecho_original !== s.sugestao)
                .map((s) => ({
                  trecho_original: String(s.trecho_original).trim(),
                  sugestao: String(s.sugestao).trim(),
                  motivo: String(s.motivo || "").trim(),
                }))
            : [],
        };
      } catch (e) {
        ultimoErro = e;
        const transitorio = !e.status || [429, 500, 502, 503, 504].includes(e.status);
        if (!transitorio) break;
        await espera(1500 * (tent + 1));
      }
    }
  }
  throw ultimoErro || new Error("Falha ao revisar.");
}
