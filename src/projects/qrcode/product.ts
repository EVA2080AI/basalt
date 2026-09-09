import QRCode from "qrcode";
import type { Product } from "../../products/types.js";

const MAX_TEXT_CHARS = 2_000;

/**
 * Quinto producto de Basalt: genera un código QR (PNG en base64) para un
 * texto o URL — útil para un agente que lanza un producto y necesita dar una
 * forma rápida de compartirlo (ej. un link de pago, una URL de onboarding).
 */
export const qrcodeProduct: Product = {
  id: "qrcode",
  method: "POST",
  path: "/qrcode",
  priceUsd: Number(process.env.AUTOMATON_PRICE_QRCODE_USD ?? 0.002),
  description: "Genera un código QR (PNG en base64) para un texto o URL.",
  inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
  inputExample: { text: "https://basalt-n6lt.onrender.com" },
  outputSchema: { type: "object", properties: { text: { type: "string" }, image: { type: "string" } }, required: ["text", "image"] },
  async handler(req, res) {
    const text = req.body?.text;
    if (typeof text !== "string" || text.length === 0) {
      res.status(400).json({ error: "Body debe incluir { text: string }" });
      return;
    }
    if (text.length > MAX_TEXT_CHARS) {
      res.status(413).json({ error: `El texto supera el máximo de ${MAX_TEXT_CHARS} caracteres.` });
      return;
    }
    try {
      const dataUrl = await QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 2 });
      res.json({ text, image: dataUrl });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo generar el código QR." });
    }
  },
};
