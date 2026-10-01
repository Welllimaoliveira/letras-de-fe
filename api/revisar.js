import { getAutoraFromRequest } from "./lib/supabase.js";
import { revisarTexto } from "./lib/gemini.js";

const MAX_CHARS = 12000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido." });
    return;
  }

  try {
    const autora = await getAutoraFromRequest(req);
    if (!autora) {
      res.status(401).json({ erro: "Não autorizado." });
      return;
    }

    const { texto } = req.body || {};
    if (!texto || typeof texto !== "string" || !texto.trim()) {
      res.status(400).json({ erro: "Envie o campo 'texto'." });
      return;
    }
    if (texto.length > MAX_CHARS) {
      res.status(400).json({ erro: `Texto muito longo (máx. ${MAX_CHARS} caracteres por revisão).` });
      return;
    }

    const resultado = await revisarTexto(texto);
    res.status(200).json(resultado);
  } catch (erro) {
    console.error("Erro em /api/revisar:", erro);
    res.status(500).json({ erro: String(erro.message || erro) });
  }
}
