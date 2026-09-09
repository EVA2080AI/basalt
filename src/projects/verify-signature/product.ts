import { recoverMessageAddress, recoverTypedDataAddress, isAddressEqual, type Address } from "viem";
import type { Product } from "../../products/types.js";

/**
 * Tenth Basalt product: recovers the signer of an EIP-191 (personal_sign) or
 * EIP-712 (typed data) signature and checks it against a claimed address —
 * pure crypto recovery, no RPC call, no network dependency. Built for the
 * exact audience Basalt sells to: agents that need to verify a counterparty's
 * signed claim (e.g. a SIWE/SIWX login, an order, an attestation) before
 * trusting it.
 */
export const verifySignatureProduct: Product = {
  id: "verify-signature",
  method: "POST",
  path: "/verify-signature",
  priceUsd: Number(process.env.AUTOMATON_PRICE_VERIFY_SIGNATURE_USD ?? 0.002),
  description: "Recovers the signer of an EIP-191 or EIP-712 signature and checks it against a claimed address.",
  launchedAt: "2026-09-09",
  inputSchema: {
    type: "object",
    required: ["address", "signature", "message"],
    properties: {
      type: { type: "string", enum: ["personal", "typed"], default: "personal" },
      address: { type: "string" },
      signature: { type: "string" },
      message: {},
      domain: { type: "object" },
      types: { type: "object" },
      primaryType: { type: "string" },
    },
  },
  inputExample: {
    type: "personal",
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    signature:
      "0x23b91915579c0f1891f7f7bb72d00c843c64a76c0af31580eb4dba3ad447cb594a56483d4873e0723252bc419cd414085366501ed1c3dd8ccf23561212b3945c1c",
    message: "Hello, Basalt!",
  },
  outputSchema: {
    type: "object",
    properties: {
      valid: { type: "boolean" },
      recoveredAddress: { type: "string" },
      expectedAddress: { type: "string" },
    },
    required: ["valid", "recoveredAddress", "expectedAddress"],
  },
  outputExample: {
    valid: true,
    recoveredAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    expectedAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  },
  async handler(req, res) {
    const { type, address, signature, message, domain, types, primaryType } = req.body ?? {};
    if (typeof address !== "string" || typeof signature !== "string") {
      res.status(400).json({ error: "Body must include { address: string, signature: string, ... }" });
      return;
    }
    try {
      let recovered: Address;
      if (type === "typed") {
        if (typeof domain !== "object" || typeof types !== "object" || typeof primaryType !== "string" || message === undefined) {
          res.status(400).json({ error: "Typed signatures require { domain, types, primaryType, message }" });
          return;
        }
        recovered = await recoverTypedDataAddress({
          domain,
          types,
          primaryType,
          message,
          signature: signature as `0x${string}`,
        });
      } else {
        if (typeof message !== "string") {
          res.status(400).json({ error: "Personal signatures require { message: string }" });
          return;
        }
        recovered = await recoverMessageAddress({ message, signature: signature as `0x${string}` });
      }
      res.json({ valid: isAddressEqual(recovered, address as Address), recoveredAddress: recovered, expectedAddress: address });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "Could not recover a signer from this signature." });
    }
  },
};
