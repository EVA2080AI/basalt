import type { Product } from "../../products/types.js";

const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ref|igshid|yclid|_ga)$/i;

/**
 * Eighteenth Basalt product: parses and normalizes a URL — components,
 * query params as an object, and a canonical form with tracking parameters
 * stripped, host lowercased, default ports and trailing fragments removed.
 * Pure WHATWG URL parsing, no fetch.
 */
export const urlParseProduct: Product = {
  id: "url-parse",
  method: "POST",
  path: "/url-parse",
  priceUsd: Number(process.env.AUTOMATON_PRICE_URL_PARSE_USD ?? 0.002),
  description: "Parses a URL into its components and returns a normalized canonical form with tracking parameters (utm_*, fbclid, gclid…) removed.",
  launchedAt: "2026-09-12",
  inputSchema: {
    type: "object",
    required: ["url"],
    properties: { url: { type: "string" } },
  },
  inputExample: { url: "HTTPS://Example.com:443/a/../docs/?utm_source=x&q=basalt#top" },
  outputSchema: {
    type: "object",
    properties: {
      valid: { type: "boolean" },
      canonical: { type: "string" },
      protocol: { type: "string" },
      hostname: { type: "string" },
      port: { type: ["string", "null"] },
      pathname: { type: "string" },
      query: { type: "object" },
      fragment: { type: ["string", "null"] },
      removedParams: { type: "array", items: { type: "string" } },
      isSecure: { type: "boolean" },
    },
    required: ["valid", "canonical", "protocol", "hostname", "pathname", "query", "removedParams", "isSecure"],
  },
  outputExample: {
    valid: true,
    canonical: "https://example.com/docs/?q=basalt",
    protocol: "https",
    hostname: "example.com",
    port: null,
    pathname: "/docs/",
    query: { q: "basalt" },
    fragment: "top",
    removedParams: ["utm_source"],
    isSecure: true,
  },
  handler(req, res) {
    const { url } = req.body ?? {};
    if (typeof url !== "string" || url.trim().length === 0) {
      res.status(400).json({ error: "Body must include { url: string }" });
      return;
    }
    let u: URL;
    try {
      u = new URL(url.trim());
    } catch {
      res.status(422).json({ valid: false, error: "Not a parseable absolute URL" });
      return;
    }
    const removedParams: string[] = [];
    const query: Record<string, string | string[]> = {};
    const kept = new URLSearchParams();
    for (const [k, v] of u.searchParams) {
      if (TRACKING_PARAMS.test(k)) {
        if (!removedParams.includes(k)) removedParams.push(k);
        continue;
      }
      kept.append(k, v);
      const prev = query[k];
      if (prev === undefined) query[k] = v;
      else query[k] = Array.isArray(prev) ? [...prev, v] : [prev, v];
    }
    kept.sort();
    const canon = new URL(u.toString());
    canon.hash = "";
    canon.search = kept.toString();
    canon.hostname = u.hostname.toLowerCase();

    res.json({
      valid: true,
      canonical: canon.toString(),
      protocol: u.protocol.replace(/:$/, ""),
      hostname: u.hostname.toLowerCase(),
      port: u.port || null,
      pathname: u.pathname,
      query,
      fragment: u.hash ? u.hash.slice(1) : null,
      removedParams,
      isSecure: u.protocol === "https:",
    });
  },
};
