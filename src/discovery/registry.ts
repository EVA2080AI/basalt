import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { collectSeeds, probeAll, probePeer, sellers, type Peer, type PeerRegistry } from "./peers.js";

/**
 * Registro de pares en memoria.
 *
 * Arranca desde peers-snapshot.json, que está commiteado en el repo: así una
 * request pagada nunca depende de que un tercero esté vivo en ese instante. El
 * rastreo real corre asincrónico desde el pulso del server y solo reemplaza el
 * registro cuando termina bien — el producto se sirve de memoria, siempre.
 */

const SNAPSHOT_FILE = "peers-snapshot.json";

let registry: PeerRegistry = { crawledAt: "1970-01-01T00:00:00Z", seedCount: 0, peers: [] };
let lastRefresh: { at: string; sellers: number; resources: number; error?: string } | null = null;
let refreshing = false;

/** Carga el snapshot commiteado. Idempotente y tolerante a que no exista. */
export function loadSnapshot(cwd = process.cwd()): void {
  const file = path.join(cwd, SNAPSHOT_FILE);
  if (!existsSync(file)) return;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as PeerRegistry;
    if (Array.isArray(parsed.peers)) registry = parsed;
  } catch {
    // Un snapshot ilegible no debe impedir que el server arranque y cobre.
  }
}

export function getRegistry(): PeerRegistry {
  return registry;
}

export function registrySummary() {
  const found = sellers(registry);
  const resources = found.reduce((n, p) => n + p.resources.length, 0);
  const priced = found.flatMap((p) => p.resources).filter((r) => typeof r.priceUsd === "number").length;
  return {
    crawledAt: registry.crawledAt,
    seedsKnown: registry.seedCount,
    sellersVerified: found.length,
    resourcesIndexed: resources,
    resourcesWithPrice: priced,
    lastRefresh,
  };
}

/**
 * Re-rastrea el ecosistema y reemplaza el registro. Solo lectura, nunca paga.
 * Si falla, deja el registro anterior intacto — datos viejos son mejores que
 * ninguno para un endpoint que se cobra.
 */
export async function refresh(now: string): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    const seeds = await collectSeeds();
    if (seeds.length === 0) throw new Error("ninguna semilla alcanzable");
    const peers = await probeAll(seeds);
    const next: PeerRegistry = {
      crawledAt: now,
      seedCount: seeds.length,
      peers: peers.sort((a, b) => a.origin.localeCompare(b.origin)),
    };
    registry = next;
    const found = sellers(next);
    lastRefresh = {
      at: now,
      sellers: found.length,
      resources: found.reduce((n, p) => n + p.resources.length, 0),
    };
  } catch (err) {
    lastRefresh = {
      at: now,
      sellers: lastRefresh?.sellers ?? 0,
      resources: lastRefresh?.resources ?? 0,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    refreshing = false;
  }
}

/**
 * Revalida solo los vendedores que ya están en el índice. Es el rastreo barato:
 * ~40 requests en vez de ~600, así puede correr en cada arranque del proceso
 * sin castigar a terceros. Detecta los que se cayeron y actualiza precios, pero
 * NO descubre vendedores nuevos — eso lo hace el rastreo completo.
 *
 * Un par que deja de responder se marca, no se borra: puede estar durmiendo
 * igual que Basalt en el plan free de Render, y borrarlo perdería la única
 * manera de volver a encontrarlo.
 */
export async function revalidateKnown(now: string): Promise<{
  checked: number;
  stillSelling: number;
  wentDark: string[];
}> {
  const known = sellers(registry);
  if (known.length === 0) return { checked: 0, stillSelling: 0, wentDark: [] };

  const wentDark: string[] = [];
  const updated: Peer[] = [];

  // Secuencial con concurrencia baja: son pocos y no hay apuro.
  const results = await Promise.all(
    known.map(async (peer) => ({ before: peer, after: await probePeer(peer.origin) })),
  );

  for (const { before, after } of results) {
    const stillSells = after.kind === "x402_manifest" || after.kind === "x402_402";
    if (stillSells) {
      updated.push(after);
    } else {
      wentDark.push(before.origin);
      // Se conserva la entrada anterior, anotando que no respondió.
      updated.push({ ...before, note: `no respondió en la revalidación de ${now}` });
    }
  }

  registry = { ...registry, peers: updated.sort((a, b) => a.origin.localeCompare(b.origin)) };
  const stillSelling = updated.length - wentDark.length;
  lastRefresh = { at: now, sellers: stillSelling, resources: sellers(registry).reduce((n, p) => n + p.resources.length, 0) };
  return { checked: known.length, stillSelling, wentDark };
}

export interface DiscoverQuery {
  query?: string;
  maxPriceUsd?: number;
  network?: string;
  withPriceOnly?: boolean;
  limit?: number;
}

export interface DiscoverMatch {
  origin: string;
  method?: string;
  path?: string;
  description?: string;
  priceUsd?: number;
  network?: string;
  payTo?: string;
  evidence: Peer["kind"];
}

/** Busca en el registro. Computación pura sobre memoria: cero red por request. */
export function discover(q: DiscoverQuery): { matches: DiscoverMatch[]; totalMatches: number } {
  const needle = (q.query ?? "").trim().toLowerCase();
  const limit = Math.min(Math.max(q.limit ?? 20, 1), 100);
  const out: DiscoverMatch[] = [];

  for (const peer of sellers(registry)) {
    for (const r of peer.resources) {
      if (q.network && r.network !== q.network && peer.network !== q.network) continue;
      if (q.withPriceOnly && typeof r.priceUsd !== "number") continue;
      if (q.maxPriceUsd !== undefined) {
        if (typeof r.priceUsd !== "number" || r.priceUsd > q.maxPriceUsd) continue;
      }
      if (needle) {
        const haystack = `${peer.origin} ${r.resource ?? ""} ${r.path ?? ""} ${r.description ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) continue;
      }
      out.push({
        origin: peer.origin,
        method: r.method,
        path: r.path,
        description: r.description,
        priceUsd: r.priceUsd,
        network: r.network ?? peer.network,
        payTo: r.payTo ?? peer.payTo,
        evidence: peer.kind,
      });
    }
  }

  // Más barato primero; los sin precio al final (no se puede comparar lo que no está).
  out.sort((a, b) => (a.priceUsd ?? Infinity) - (b.priceUsd ?? Infinity));
  return { matches: out.slice(0, limit), totalMatches: out.length };
}
