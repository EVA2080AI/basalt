import { isIPv4, isIPv6, BlockList } from "node:net";
import type { Product } from "../../products/types.js";

const V4_RANGES: [string, number, string][] = [
  ["0.0.0.0", 8, "this_network"],
  ["10.0.0.0", 8, "private"],
  ["100.64.0.0", 10, "carrier_grade_nat"],
  ["127.0.0.0", 8, "loopback"],
  ["169.254.0.0", 16, "link_local"],
  ["172.16.0.0", 12, "private"],
  ["192.0.0.0", 24, "ietf_protocol"],
  ["192.0.2.0", 24, "documentation"],
  ["192.168.0.0", 16, "private"],
  ["198.18.0.0", 15, "benchmarking"],
  ["198.51.100.0", 24, "documentation"],
  ["203.0.113.0", 24, "documentation"],
  ["224.0.0.0", 4, "multicast"],
  ["240.0.0.0", 4, "reserved"],
  ["255.255.255.255", 32, "broadcast"],
];
const V6_RANGES: [string, number, string][] = [
  ["::1", 128, "loopback"],
  ["::", 128, "unspecified"],
  ["::ffff:0:0", 96, "ipv4_mapped"],
  ["64:ff9b::", 96, "ipv4_translated"],
  ["100::", 64, "discard"],
  ["2001:db8::", 32, "documentation"],
  ["fc00::", 7, "private"],
  ["fe80::", 10, "link_local"],
  ["ff00::", 8, "multicast"],
];

function classify(ip: string, family: "ipv4" | "ipv6"): string {
  const ranges = family === "ipv4" ? V4_RANGES : V6_RANGES;
  for (const [net, prefix, label] of ranges) {
    const bl = new BlockList();
    bl.addSubnet(net, prefix, family);
    if (bl.check(ip, family)) return label;
  }
  return "public";
}

function inCidr(ip: string, family: "ipv4" | "ipv6", cidr: string): boolean | null {
  const m = /^(.+)\/(\d{1,3})$/.exec(cidr.trim());
  if (!m) return null;
  const [, net, p] = m;
  const prefix = Number(p);
  const netFamily = isIPv4(net) ? "ipv4" : isIPv6(net) ? "ipv6" : null;
  if (!netFamily || netFamily !== family || prefix > (family === "ipv4" ? 32 : 128)) return null;
  const bl = new BlockList();
  bl.addSubnet(net, prefix, family);
  return bl.check(ip, family);
}

/**
 * Twentieth Basalt product: classifies an IP address (public / private /
 * loopback / link-local / documentation / multicast…) and optionally tests it
 * against a list of CIDR ranges — the SSRF and allowlist check an agent needs
 * before fetching a user-supplied host. Pure table lookup via node:net, no
 * geolocation, no external database.
 */
export const ipCheckProduct: Product = {
  id: "ip-check",
  method: "POST",
  path: "/ip-check",
  priceUsd: Number(process.env.AUTOMATON_PRICE_IP_CHECK_USD ?? 0.002),
  description: "Classifies an IPv4/IPv6 address (public, private, loopback, link-local, reserved…) and tests it against optional CIDR ranges — an SSRF/allowlist check.",
  launchedAt: "2026-09-12",
  inputSchema: {
    type: "object",
    required: ["ip"],
    properties: {
      ip: { type: "string" },
      cidrs: { type: "array", items: { type: "string" }, description: "Optional CIDR ranges to test membership against." },
    },
  },
  inputExample: { ip: "10.1.2.3", cidrs: ["10.0.0.0/8", "192.168.0.0/16"] },
  outputSchema: {
    type: "object",
    properties: {
      valid: { type: "boolean" },
      ip: { type: "string" },
      family: { type: ["string", "null"], enum: ["ipv4", "ipv6", null] },
      scope: { type: ["string", "null"] },
      isPublic: { type: "boolean" },
      safeToFetch: { type: "boolean", description: "true only for public unicast addresses — false for anything an SSRF guard should block." },
      cidrMatches: { type: "object", additionalProperties: { type: ["boolean", "null"] } },
    },
    required: ["valid", "ip", "family", "scope", "isPublic", "safeToFetch", "cidrMatches"],
  },
  outputExample: {
    valid: true,
    ip: "10.1.2.3",
    family: "ipv4",
    scope: "private",
    isPublic: false,
    safeToFetch: false,
    cidrMatches: { "10.0.0.0/8": true, "192.168.0.0/16": false },
  },
  handler(req, res) {
    const { ip, cidrs } = req.body ?? {};
    if (typeof ip !== "string" || ip.trim().length === 0) {
      res.status(400).json({ error: "Body must include { ip: string, cidrs?: string[] }" });
      return;
    }
    const clean = ip.trim();
    const family = isIPv4(clean) ? "ipv4" : isIPv6(clean) ? "ipv6" : null;
    if (!family) {
      res.json({ valid: false, ip: clean, family: null, scope: null, isPublic: false, safeToFetch: false, cidrMatches: {} });
      return;
    }
    const scope = classify(clean, family);
    const cidrMatches: Record<string, boolean | null> = {};
    if (Array.isArray(cidrs)) {
      for (const c of cidrs.slice(0, 50)) {
        if (typeof c === "string") cidrMatches[c] = inCidr(clean, family, c);
      }
    }
    const isPublic = scope === "public";
    res.json({ valid: true, ip: clean, family, scope, isPublic, safeToFetch: isPublic, cidrMatches });
  },
};
