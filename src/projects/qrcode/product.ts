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
  description: "Generates a QR code (PNG, base64) for a text string or URL.",
  launchedAt: "2026-09-08",
  inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
  inputExample: { text: "https://basalt-n6lt.onrender.com" },
  outputSchema: { type: "object", properties: { text: { type: "string" }, image: { type: "string" } }, required: ["text", "image"] },
  outputExample: {
    text: "https://basalt-n6lt.onrender.com",
    image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  },
  async handler(req, res) {
    const text = req.body?.text;
    if (typeof text !== "string" || text.length === 0) {
      res.status(400).json({ error: "Body must include { text: string }" });
      return;
    }
    if (text.length > MAX_TEXT_CHARS) {
      res.status(413).json({ error: `Text exceeds the maximum of ${MAX_TEXT_CHARS} characters.` });
      return;
    }
    try {
      const dataUrl = await QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 2 });
      res.json({ text, image: dataUrl });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "Could not generate the QR code." });
    }
  },
};
