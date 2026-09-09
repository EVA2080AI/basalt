import type { Product } from "../../products/types.js";
import { checkSsl } from "./lookup.js";

export const sslCheckProduct: Product = {
  id: "ssl-check",
  method: "POST",
  path: "/ssl-check",
  priceUsd: Number(process.env.AUTOMATON_PRICE_SSL_CHECK_USD ?? 0.005),
  description: "Revisa el certificado TLS de un dominio: validez, emisor, y días hasta que vence.",
  inputSchema: { type: "object", required: ["domain"], properties: { domain: { type: "string" } } },
  inputExample: { domain: "example.com" },
  outputSchema: {
    type: "object",
    properties: {
      domain: { type: "string" },
      valid: { type: "boolean" },
      issuer: { type: ["string", "null"] },
      subject: { type: ["string", "null"] },
      validFrom: { type: "string" },
      validTo: { type: "string" },
      daysUntilExpiry: { type: "number" },
      expired: { type: "boolean" },
    },
    required: ["domain", "valid", "validTo"],
  },
  async handler(req, res) {
    const domain = req.body?.domain;
    if (typeof domain !== "string") {
      res.status(400).json({ error: "Body debe incluir { domain: string }" });
      return;
    }
    try {
      const result = await checkSsl(domain);
      res.json(result);
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "Error desconocido" });
    }
  },
};
