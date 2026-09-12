import { getAddress, isAddress } from "viem";
import type { Product } from "../../products/types.js";

/**
 * Nineteenth Basalt product: validates an EVM address and returns its
 * EIP-55 checksummed form — the one check every agent should run before
 * sending funds or trusting a counterparty string. Pure keccak math via viem,
 * no RPC. Flags the zero address and whether the input was already
 * correctly checksummed (a mixed-case address with a wrong checksum is a
 * typo signal, not just a formatting issue).
 */
export const ethAddressProduct: Product = {
  id: "eth-address",
  method: "POST",
  path: "/eth-address",
  priceUsd: Number(process.env.AUTOMATON_PRICE_ETH_ADDRESS_USD ?? 0.002),
  description: "Validates an EVM address and returns its EIP-55 checksummed form; flags bad checksums and the zero address.",
  launchedAt: "2026-09-12",
  inputSchema: {
    type: "object",
    required: ["address"],
    properties: { address: { type: "string" } },
  },
  inputExample: { address: "0x1816489d28c8c9fd2ede2d38b1a52eeda54e8fdb" },
  outputSchema: {
    type: "object",
    properties: {
      valid: { type: "boolean" },
      checksummed: { type: ["string", "null"] },
      lowercase: { type: ["string", "null"] },
      inputChecksumValid: { type: ["boolean", "null"], description: "null when input has no mixed case (nothing to verify)." },
      isZeroAddress: { type: "boolean" },
    },
    required: ["valid", "checksummed", "lowercase", "inputChecksumValid", "isZeroAddress"],
  },
  outputExample: {
    valid: true,
    checksummed: "0x1816489D28C8C9fD2EdE2d38B1A52EedA54e8FDb",
    lowercase: "0x1816489d28c8c9fd2ede2d38b1a52eeda54e8fdb",
    inputChecksumValid: null,
    isZeroAddress: false,
  },
  handler(req, res) {
    const { address } = req.body ?? {};
    if (typeof address !== "string" || address.trim().length === 0) {
      res.status(400).json({ error: "Body must include { address: string }" });
      return;
    }
    const raw = address.trim();
    if (!isAddress(raw, { strict: false })) {
      res.json({ valid: false, checksummed: null, lowercase: null, inputChecksumValid: null, isZeroAddress: false });
      return;
    }
    const checksummed = getAddress(raw);
    const hex = raw.slice(2);
    const hasMixedCase = hex !== hex.toLowerCase() && hex !== hex.toUpperCase();
    res.json({
      valid: true,
      checksummed,
      lowercase: raw.toLowerCase(),
      inputChecksumValid: hasMixedCase ? raw === checksummed : null,
      isZeroAddress: /^0x0{40}$/i.test(raw),
    });
  },
};
