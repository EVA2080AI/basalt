import type { Product } from "../../products/types.js";
import { checkEmail } from "./lookup.js";

export const emailCheckProduct: Product = {
  id: "email-check",
  method: "POST",
  path: "/email-check",
  priceUsd: Number(process.env.AUTOMATON_PRICE_EMAIL_CHECK_USD ?? 0.005),
  description: "Valida sintaxis de un email y confirma registros MX reales del dominio — filtra direcciones que no pueden recibir correo.",
  inputSchema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } },
  inputExample: { email: "hello@example.com" },
  outputSchema: {
    type: "object",
    properties: {
      email: { type: "string" },
      validSyntax: { type: "boolean" },
      domain: { type: ["string", "null"] },
      hasMxRecords: { type: "boolean" },
      mxHosts: { type: "array", items: { type: "string" } },
      deliverable: { type: "boolean" },
    },
    required: ["email", "validSyntax", "deliverable"],
  },
  outputExample: {
    email: "hello@example.com",
    validSyntax: true,
    domain: "example.com",
    hasMxRecords: true,
    mxHosts: ["mail.example.com"],
    deliverable: true,
  },
  async handler(req, res) {
    const email = req.body?.email;
    if (typeof email !== "string") {
      res.status(400).json({ error: "Body debe incluir { email: string }" });
      return;
    }
    try {
      const result = await checkEmail(email);
      res.json(result);
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "Error desconocido" });
    }
  },
};
