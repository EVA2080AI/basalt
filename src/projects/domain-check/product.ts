import type { Product } from "../../products/types.js";
import { checkDomain } from "./lookup.js";

export const domainCheckProduct: Product = {
  id: "domain-check",
  method: "POST",
  path: "/domain-check",
  priceUsd: Number(process.env.AUTOMATON_PRICE_DOMAIN_CHECK_USD ?? 0.01),
  description: "Checks whether a domain is available to register via RDAP, or who owns it and when it expires if not.",
  launchedAt: "2026-09-08",
  inputSchema: { type: "object", required: ["domain"], properties: { domain: { type: "string" } } },
  inputExample: { domain: "example.com" },
  outputSchema: {
    type: "object",
    properties: {
      domain: { type: "string" },
      available: { type: "boolean" },
      registrar: { type: ["string", "null"] },
      createdAt: { type: ["string", "null"] },
      expiresAt: { type: ["string", "null"] },
      status: { type: "array", items: { type: "string" } },
    },
    required: ["domain", "available"],
  },
  outputExample: {
    domain: "example.com",
    available: false,
    registrar: "RESERVED-Internet Assigned Numbers Authority",
    createdAt: "1995-08-14T04:00:00Z",
    expiresAt: "2026-08-13T04:00:00Z",
    status: ["active"],
  },
  async handler(req, res) {
    const domain = req.body?.domain;
    if (typeof domain !== "string") {
      res.status(400).json({ error: "Body must include { domain: string }" });
      return;
    }
    try {
      const result = await checkDomain(domain);
      res.json(result);
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  },
};
