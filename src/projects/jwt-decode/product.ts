import type { Product } from "../../products/types.js";

function b64urlToJson(segment: string): unknown {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (segment.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

/**
 * Seventeenth Basalt product: decodes a JWT without verifying it — header,
 * claims, and a time check (expired / not yet valid / active) so an agent can
 * inspect a token it received before deciding whether to trust or forward it.
 * Deliberately does NOT verify the signature: that needs the issuer's key,
 * which Basalt never holds. The response says so explicitly.
 */
export const jwtDecodeProduct: Product = {
  id: "jwt-decode",
  method: "POST",
  path: "/jwt-decode",
  priceUsd: Number(process.env.AUTOMATON_PRICE_JWT_DECODE_USD ?? 0.002),
  description: "Decodes a JWT's header and claims and reports its time status (active, expired, not yet valid) — without signature verification.",
  launchedAt: "2026-09-12",
  inputSchema: {
    type: "object",
    required: ["token"],
    properties: { token: { type: "string" } },
  },
  inputExample: {
    token:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkJhc2FsdCIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  },
  outputSchema: {
    type: "object",
    properties: {
      header: { type: "object" },
      payload: { type: "object" },
      algorithm: { type: ["string", "null"] },
      issuedAt: { type: ["string", "null"] },
      expiresAt: { type: ["string", "null"] },
      notBefore: { type: ["string", "null"] },
      status: { type: "string", enum: ["active", "expired", "not_yet_valid", "no_expiry"] },
      signatureVerified: { type: "boolean", const: false },
    },
    required: ["header", "payload", "status", "signatureVerified"],
  },
  outputExample: {
    header: { alg: "HS256", typ: "JWT" },
    payload: { sub: "1234567890", name: "Basalt", iat: 1516239022 },
    algorithm: "HS256",
    issuedAt: "2018-01-18T01:30:22.000Z",
    expiresAt: null,
    notBefore: null,
    status: "no_expiry",
    signatureVerified: false,
  },
  handler(req, res) {
    const { token } = req.body ?? {};
    if (typeof token !== "string" || token.trim().length === 0) {
      res.status(400).json({ error: "Body must include { token: string }" });
      return;
    }
    const parts = token.trim().split(".");
    if (parts.length !== 3) {
      res.status(422).json({ error: "Not a JWT: expected three dot-separated segments" });
      return;
    }
    let header: Record<string, unknown>;
    let payload: Record<string, unknown>;
    try {
      header = b64urlToJson(parts[0]) as Record<string, unknown>;
      payload = b64urlToJson(parts[1]) as Record<string, unknown>;
    } catch {
      res.status(422).json({ error: "Header or payload is not valid base64url-encoded JSON" });
      return;
    }
    const toIso = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? new Date(v * 1000).toISOString() : null);
    const now = Date.now() / 1000;
    const exp = typeof payload.exp === "number" ? payload.exp : null;
    const nbf = typeof payload.nbf === "number" ? payload.nbf : null;
    let status: "active" | "expired" | "not_yet_valid" | "no_expiry" = "no_expiry";
    if (nbf !== null && now < nbf) status = "not_yet_valid";
    else if (exp !== null) status = now >= exp ? "expired" : "active";

    res.json({
      header,
      payload,
      algorithm: typeof header.alg === "string" ? header.alg : null,
      issuedAt: toIso(payload.iat),
      expiresAt: toIso(payload.exp),
      notBefore: toIso(payload.nbf),
      status,
      signatureVerified: false,
    });
  },
};
