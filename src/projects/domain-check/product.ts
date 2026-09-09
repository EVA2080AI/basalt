import type { Product } from "../../products/types.js";
import { checkDomain } from "./lookup.js";

export const domainCheckProduct: Product = {
  id: "domain-check",
  method: "POST",
  path: "/domain-check",
  priceUsd: Number(process.env.AUTOMATON_PRICE_DOMAIN_CHECK_USD ?? 0.01),
  description: "Revisa si un dominio está disponible para registrar vía RDAP, o quién lo tiene y cuándo vence si no lo está.",
  async handler(req, res) {
    const domain = req.body?.domain;
    if (typeof domain !== "string") {
      res.status(400).json({ error: "Body debe incluir { domain: string }" });
      return;
    }
    try {
      const result = await checkDomain(domain);
      res.json(result);
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "Error desconocido" });
    }
  },
};
