import type { Product } from "../../products/types.js";
import { extractUrlMetadata } from "./extract.js";

export const urlMetadataProduct: Product = {
  id: "url-metadata",
  method: "POST",
  path: "/extract",
  priceUsd: Number(process.env.AUTOMATON_PRICE_URL_METADATA_USD ?? 0.005),
  description: "Extrae título, descripción, imagen y texto limpio de una URL — pensado para que otros agentes lo consuman.",
  inputSchema: { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri" } } },
  inputExample: { url: "https://example.com" },
  outputSchema: {
    type: "object",
    properties: {
      url: { type: "string" },
      title: { type: ["string", "null"] },
      description: { type: ["string", "null"] },
      image: { type: ["string", "null"] },
      siteName: { type: ["string", "null"] },
      canonicalUrl: { type: ["string", "null"] },
      textExcerpt: { type: "string" },
    },
    required: ["url", "textExcerpt"],
  },
  async handler(req, res) {
    const targetUrl = req.body?.url;
    if (typeof targetUrl !== "string") {
      res.status(400).json({ error: "Body debe incluir { url: string }" });
      return;
    }
    try {
      const metadata = await extractUrlMetadata(targetUrl);
      res.json(metadata);
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "Error desconocido" });
    }
  },
};
