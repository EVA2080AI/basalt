import IBAN from "iban";
import type { Product } from "../../products/types.js";

const BIC_RE = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Eleventh Basalt product: validates financial identifiers agents run into
 * constantly when handling payments — IBAN (mod-97 checksum), BIC/SWIFT
 * (ISO 9362 structure), and card numbers (Luhn checksum). Pure arithmetic,
 * no external API, no lookup of who actually owns the account.
 */
export const financialIdCheckProduct: Product = {
  id: "financial-id-check",
  method: "POST",
  path: "/financial-id-check",
  priceUsd: Number(process.env.AUTOMATON_PRICE_FINANCIAL_ID_CHECK_USD ?? 0.002),
  description: "Validates an IBAN (mod-97 checksum), BIC/SWIFT (ISO 9362 format), or card number (Luhn checksum).",
  launchedAt: "2026-09-09",
  inputSchema: {
    type: "object",
    required: ["type", "value"],
    properties: {
      type: { type: "string", enum: ["iban", "bic", "card"] },
      value: { type: "string" },
    },
  },
  inputExample: { type: "iban", value: "DE89370400440532013000" },
  outputSchema: {
    type: "object",
    properties: {
      type: { type: "string" },
      value: { type: "string" },
      valid: { type: "boolean" },
      formatted: { type: ["string", "null"] },
      countryCode: { type: ["string", "null"] },
    },
    required: ["type", "value", "valid"],
  },
  outputExample: { type: "iban", value: "DE89370400440532013000", valid: true, formatted: "DE89 3704 0044 0532 0130 00", countryCode: "DE" },
  handler(req, res) {
    const { type, value } = req.body ?? {};
    if (typeof type !== "string" || typeof value !== "string" || value.trim().length === 0) {
      res.status(400).json({ error: "Body must include { type: 'iban'|'bic'|'card', value: string }" });
      return;
    }

    if (type === "iban") {
      const valid = IBAN.isValid(value);
      res.json({
        type,
        value,
        valid,
        formatted: valid ? IBAN.printFormat(value) : null,
        countryCode: valid ? value.slice(0, 2).toUpperCase() : null,
      });
      return;
    }

    if (type === "bic") {
      const clean = value.trim().toUpperCase();
      const valid = BIC_RE.test(clean);
      res.json({ type, value, valid, formatted: valid ? clean : null, countryCode: valid ? clean.slice(4, 6) : null });
      return;
    }

    if (type === "card") {
      const digits = value.replace(/[\s-]/g, "");
      const valid = /^\d{12,19}$/.test(digits) && luhnValid(digits);
      res.json({ type, value, valid, formatted: valid ? digits : null, countryCode: null });
      return;
    }

    res.status(400).json({ error: "type must be one of 'iban', 'bic', 'card'" });
  },
};
