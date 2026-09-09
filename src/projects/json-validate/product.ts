import { Ajv, type ErrorObject } from "ajv";
import type { Product } from "../../products/types.js";

const ajv = new Ajv({ allErrors: true, strict: false });

function formatErrors(errors: ErrorObject[] | null | undefined) {
  return (errors ?? []).map((e) => ({ path: e.instancePath || "/", message: e.message ?? "invalid" }));
}

/**
 * Ninth Basalt product: validates a JSON payload against a JSON Schema.
 * Built for the exact audience Basalt sells to — agents that call typed
 * APIs and need to check a request/response shape before spending on it.
 */
export const jsonValidateProduct: Product = {
  id: "json-validate",
  method: "POST",
  path: "/json-validate",
  priceUsd: Number(process.env.AUTOMATON_PRICE_JSON_VALIDATE_USD ?? 0.002),
  description: "Validates a JSON payload against a JSON Schema (draft 2020-12) and returns the exact validation errors.",
  launchedAt: "2026-09-09",
  inputSchema: {
    type: "object",
    required: ["data", "schema"],
    properties: {
      data: {},
      schema: { type: "object" },
    },
  },
  inputExample: {
    data: { name: "Ada", age: 30 },
    schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, age: { type: "number" } } },
  },
  outputSchema: {
    type: "object",
    properties: {
      valid: { type: "boolean" },
      errors: { type: "array", items: { type: "object", properties: { path: { type: "string" }, message: { type: "string" } } } },
    },
    required: ["valid", "errors"],
  },
  outputExample: { valid: true, errors: [] },
  handler(req, res) {
    const { data, schema } = req.body ?? {};
    if (schema === undefined || typeof schema !== "object" || schema === null) {
      res.status(400).json({ error: "Body must include { data: any, schema: object }" });
      return;
    }
    if (data === undefined) {
      res.status(400).json({ error: "Body must include { data: any, schema: object }" });
      return;
    }
    try {
      const validate = ajv.compile(schema);
      const valid = validate(data) as boolean;
      res.json({ valid, errors: formatErrors(validate.errors) });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "Invalid JSON Schema." });
    }
  },
};
