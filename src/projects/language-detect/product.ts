import { francAll } from "franc";
import type { Product } from "../../products/types.js";

const MAX_TEXT_CHARS = 10_000;

/**
 * Octavo producto de Basalt: detecta el idioma de un texto — soporta 186
 * idiomas, sin depender de ninguna API externa.
 */
export const languageDetectProduct: Product = {
  id: "language-detect",
  method: "POST",
  path: "/language-detect",
  priceUsd: Number(process.env.AUTOMATON_PRICE_LANGUAGE_DETECT_USD ?? 0.002),
  description: "Detecta el idioma de un texto (186 idiomas soportados), con el top 3 más probable.",
  inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
  inputExample: { text: "Hola, esto es una prueba." },
  outputSchema: {
    type: "object",
    properties: {
      language: { type: "string" },
      confident: { type: "boolean" },
      candidates: { type: "array", items: { type: "object", properties: { code: { type: "string" }, score: { type: "number" } } } },
    },
    required: ["language", "confident"],
  },
  handler(req, res) {
    const text = req.body?.text;
    if (typeof text !== "string" || text.trim().length === 0) {
      res.status(400).json({ error: "Body debe incluir { text: string }" });
      return;
    }
    try {
      const candidates = francAll(text.slice(0, MAX_TEXT_CHARS)).slice(0, 3);
      const [top] = candidates;
      res.json({
        language: top ? top[0] : "und",
        confident: top ? top[0] !== "und" : false,
        candidates: candidates.map(([code, score]) => ({ code, score })),
      });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo detectar el idioma." });
    }
  },
};
