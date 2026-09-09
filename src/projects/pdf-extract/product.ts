import { PDFParse } from "pdf-parse";
import type { Product } from "../../products/types.js";

const MAX_TEXT_CHARS = 20_000;

/**
 * Sexto producto de Basalt: extrae el texto de un PDF dado por URL — para
 * que un agente no tenga que lidiar con el formato binario de PDF él mismo.
 */
export const pdfExtractProduct: Product = {
  id: "pdf-extract",
  method: "POST",
  path: "/pdf-extract",
  priceUsd: Number(process.env.AUTOMATON_PRICE_PDF_EXTRACT_USD ?? 0.01),
  description: "Extracts the text from a PDF given its URL.",
  launchedAt: "2026-09-09",
  inputSchema: { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri" } } },
  inputExample: { url: "https://bitcoin.org/bitcoin.pdf" },
  outputSchema: {
    type: "object",
    properties: { url: { type: "string" }, pages: { type: "number" }, text: { type: "string" }, truncated: { type: "boolean" } },
    required: ["url", "pages", "text"],
  },
  outputExample: {
    url: "https://bitcoin.org/bitcoin.pdf",
    pages: 9,
    text: "Bitcoin: A Peer-to-Peer Electronic Cash System\n\nSatoshi Nakamoto\nsatoshin@gmx.com\n...",
    truncated: false,
  },
  async handler(req, res) {
    const url = req.body?.url;
    if (typeof url !== "string") {
      res.status(400).json({ error: "Body must include { url: string }" });
      return;
    }

    let parser: PDFParse | undefined;
    try {
      parser = new PDFParse({ url });
      const result = await parser.getText();
      res.json({
        url,
        pages: result.total,
        text: result.text.slice(0, MAX_TEXT_CHARS),
        truncated: result.text.length > MAX_TEXT_CHARS,
      });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "Could not extract text from the PDF." });
    } finally {
      await parser?.destroy();
    }
  },
};
