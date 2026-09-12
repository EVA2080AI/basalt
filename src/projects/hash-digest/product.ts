import { createHash, createHmac } from "node:crypto";
import { keccak256, toBytes } from "viem";
import type { Product } from "../../products/types.js";

const NODE_ALGOS = new Set(["sha256", "sha512", "sha1", "md5", "sha3-256"]);

/**
 * Sixteenth Basalt product: hashes text with the digests agents need most
 * when producing or checking integrity proofs — SHA-2/SHA-3/MD5 via
 * node:crypto, keccak256 (the EVM hash) via viem, and optional HMAC keying.
 * Pure computation, no I/O.
 */
export const hashDigestProduct: Product = {
  id: "hash-digest",
  method: "POST",
  path: "/hash-digest",
  priceUsd: Number(process.env.AUTOMATON_PRICE_HASH_DIGEST_USD ?? 0.002),
  description: "Hashes text with sha256, sha512, sha1, md5, sha3-256, or keccak256 — optionally as an HMAC with a secret key.",
  launchedAt: "2026-09-12",
  inputSchema: {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string" },
      algorithm: { type: "string", enum: ["sha256", "sha512", "sha1", "md5", "sha3-256", "keccak256"], default: "sha256" },
      encoding: { type: "string", enum: ["hex", "base64"], default: "hex" },
      hmacKey: { type: "string", description: "If provided, computes HMAC instead of a plain hash (not supported for keccak256)." },
    },
  },
  inputExample: { text: "hello basalt", algorithm: "sha256" },
  outputSchema: {
    type: "object",
    properties: {
      algorithm: { type: "string" },
      encoding: { type: "string" },
      hmac: { type: "boolean" },
      digest: { type: "string" },
      inputBytes: { type: "integer" },
    },
    required: ["algorithm", "encoding", "hmac", "digest", "inputBytes"],
  },
  outputExample: {
    algorithm: "sha256",
    encoding: "hex",
    hmac: false,
    digest: "a1dd0cbdf338cd988c3ae904c1ec055ff8fbf1df291101f3864a6d33f6787a35",
    inputBytes: 12,
  },
  handler(req, res) {
    const { text, algorithm = "sha256", encoding = "hex", hmacKey } = req.body ?? {};
    if (typeof text !== "string") {
      res.status(400).json({ error: "Body must include { text: string }" });
      return;
    }
    if (encoding !== "hex" && encoding !== "base64") {
      res.status(400).json({ error: "encoding must be 'hex' or 'base64'" });
      return;
    }
    const inputBytes = Buffer.byteLength(text, "utf8");

    if (algorithm === "keccak256") {
      if (hmacKey !== undefined) {
        res.status(400).json({ error: "HMAC is not supported for keccak256" });
        return;
      }
      const hex = keccak256(toBytes(text));
      const digest = encoding === "hex" ? hex : Buffer.from(hex.slice(2), "hex").toString("base64");
      res.json({ algorithm, encoding, hmac: false, digest, inputBytes });
      return;
    }

    if (!NODE_ALGOS.has(algorithm)) {
      res.status(400).json({ error: "algorithm must be one of sha256, sha512, sha1, md5, sha3-256, keccak256" });
      return;
    }
    const useHmac = typeof hmacKey === "string" && hmacKey.length > 0;
    const h = useHmac ? createHmac(algorithm, hmacKey) : createHash(algorithm);
    h.update(text, "utf8");
    res.json({ algorithm, encoding, hmac: useHmac, digest: h.digest(encoding), inputBytes });
  },
};
