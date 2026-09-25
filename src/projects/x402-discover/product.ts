import type { Product } from "../../products/types.js";
import { discover, registrySummary } from "../../discovery/registry.js";

/**
 * Twenty-first Basalt product, and the first one that sells what Basalt learned
 * by looking outward instead of inward: a searchable index of live x402 seller
 * endpoints across the ecosystem.
 *
 * Every entry was verified by knocking, not copied from a directory listing —
 * either the seller publishes a parseable x402 manifest, or it returned a real
 * 402 challenge. That distinction matters: directories that only scrape a
 * listing publish endpoints that no longer exist, and prices that were never
 * there. Each match carries which kind of evidence backs it.
 *
 * Prices are reported only when they can be determined with certainty. A seller
 * that publishes an amount in a token whose decimals are unknown gets
 * priceUsd omitted rather than guessed — 92% of indexed resources publish no
 * determinable price at all, and inventing one would be worse than saying so.
 *
 * The request itself is pure computation over an in-memory index: no network
 * call, no third party in the hot path. The crawl runs asynchronously in the
 * server's own heartbeat.
 */
export const x402DiscoverProduct: Product = {
  id: "x402-discover",
  method: "POST",
  path: "/x402-discover",
  // Precio fijado con datos, no a ojo: la mediana del mercado rastreado es
  // $0.02/llamada y el p75 es $0.05. Ver el análisis en README/CLAUDE.md.
  priceUsd: Number(process.env.AUTOMATON_PRICE_X402_DISCOVER_USD ?? 0.02),
  description:
    "Searches an index of live x402 seller endpoints — each verified by knocking, not scraped — filtering by capability, max price and network.",
  descriptionEs:
    "Busca en un índice de endpoints x402 vivos — cada uno verificado golpeándolo, no copiado de un directorio — filtrando por capacidad, precio máximo y red.",
  launchedAt: "2026-09-24",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Free text matched against endpoint path, description and host." },
      maxPriceUsd: { type: "number", description: "Only endpoints with a known price at or below this." },
      network: { type: "string", description: "Filter by chain id, e.g. eip155:8453." },
      withPriceOnly: { type: "boolean", description: "Drop endpoints whose price could not be determined." },
      limit: { type: "integer", description: "Max matches to return (1-100, default 20)." },
    },
  },
  inputExample: { query: "pdf", withPriceOnly: true, limit: 5 },
  outputSchema: {
    type: "object",
    properties: {
      index: {
        type: "object",
        properties: {
          crawledAt: { type: "string" },
          sellersVerified: { type: "integer" },
          resourcesIndexed: { type: "integer" },
          resourcesWithPrice: { type: "integer" },
        },
        required: ["crawledAt", "sellersVerified", "resourcesIndexed", "resourcesWithPrice"],
      },
      totalMatches: { type: "integer" },
      matches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            origin: { type: "string" },
            method: { type: ["string", "null"] },
            path: { type: ["string", "null"] },
            description: { type: ["string", "null"] },
            priceUsd: { type: ["number", "null"], description: "Omitted when it could not be determined." },
            network: { type: ["string", "null"] },
            payTo: { type: ["string", "null"] },
            evidence: {
              type: "string",
              enum: ["x402_manifest", "x402_402"],
              description: "x402_manifest: seller publishes a parseable manifest. x402_402: seller returned a real 402.",
            },
          },
          required: ["origin", "evidence"],
        },
      },
    },
    required: ["index", "totalMatches", "matches"],
  },
  outputExample: {
    index: {
      crawledAt: "2026-09-24T21:30:00Z",
      sellersVerified: 40,
      resourcesIndexed: 2539,
      resourcesWithPrice: 208,
    },
    totalMatches: 3,
    matches: [
      {
        origin: "https://example-seller.com",
        method: "POST",
        path: "/pdf-summary",
        description: "Summarizes a PDF given its URL.",
        priceUsd: 0.01,
        network: "eip155:8453",
        payTo: "0x0000000000000000000000000000000000000000",
        evidence: "x402_manifest",
      },
    ],
  },
  handler(req, res) {
    const b = (req.body ?? {}) as Record<string, unknown>;

    const query = typeof b.query === "string" ? b.query : undefined;
    const network = typeof b.network === "string" ? b.network : undefined;
    const withPriceOnly = b.withPriceOnly === true;

    let maxPriceUsd: number | undefined;
    if (b.maxPriceUsd !== undefined) {
      const n = Number(b.maxPriceUsd);
      if (!Number.isFinite(n) || n < 0) {
        res.status(400).json({ error: "maxPriceUsd must be a non-negative number." });
        return;
      }
      maxPriceUsd = n;
    }

    let limit: number | undefined;
    if (b.limit !== undefined) {
      const n = Number(b.limit);
      if (!Number.isInteger(n) || n < 1 || n > 100) {
        res.status(400).json({ error: "limit must be an integer between 1 and 100." });
        return;
      }
      limit = n;
    }

    const { matches, totalMatches } = discover({ query, maxPriceUsd, network, withPriceOnly, limit });
    const s = registrySummary();

    res.json({
      index: {
        crawledAt: s.crawledAt,
        sellersVerified: s.sellersVerified,
        resourcesIndexed: s.resourcesIndexed,
        resourcesWithPrice: s.resourcesWithPrice,
      },
      totalMatches,
      matches,
    });
  },
};
