/**
 * Descubrimiento de pares: Basalt saliendo a ver quién más vende vía x402.
 *
 * Por qué existe: hasta ahora Basalt solo podía ser encontrado. Esto invierte la
 * dirección — sale a leer el ecosistema. Tres usos reales, en orden de valor:
 *   1. Datos de mercado: qué cobran otros por lo mismo que Basalt (hoy los
 *      precios de Basalt son una apuesta sin referencia).
 *   2. Prospección: un vendedor x402 es, por definición, un agente que ya sabe
 *      pagar por HTTP — el perfil exacto del cliente de Basalt.
 *   3. Producto vendible: búsqueda de endpoints x402 vivos por capacidad.
 *
 * Reglas duras de este módulo:
 *   - SOLO LECTURA. Nunca paga, nunca firma, nunca manda un PAYMENT header. Un
 *     402 recibido es gratis y se cuenta como señal, no como deuda.
 *   - Sin API key ni cuenta en ningún lado: todas las fuentes son públicas.
 *   - Se identifica en el User-Agent. Un crawler que no dice quién es le hace a
 *     otros operadores lo que no queremos que nos hagan a nosotros.
 */

import { DEFAULT_ASSETS } from "@x402/evm";

/** Semillas: directorios públicos del ecosistema x402, en texto plano. */
const SEED_SOURCES = [
  "https://raw.githubusercontent.com/Haustorium12/gold-402/main/directory/apis.md",
  "https://raw.githubusercontent.com/Haustorium12/gold-402/main/directory/tools.md",
  "https://raw.githubusercontent.com/Haustorium12/gold-402/main/directory/mcp-servers.md",
  "https://raw.githubusercontent.com/Haustorium12/gold-402/main/directory/ecosystem.md",
];

const USER_AGENT = "Basalt-x402-crawler/1.0 (+https://basalt-n6lt.onrender.com)";

/**
 * Tope de recursos guardados por vendedor. Un par del primer rastreo publicaba
 * 1.700 endpoints: sin tope, ese solo vendedor ahogaba cualquier búsqueda del
 * índice y pesaba 350 KB en el repo. El total real se conserva en
 * `resourceTotal`, así el recorte queda visible y no se lee como cobertura
 * completa.
 */
const MAX_RESOURCES_PER_PEER = 150;

/** Hosts que nunca son un vendedor x402 (código, redes, docs, paquetes). */
const NON_SELLER_HOSTS =
  /(^|\.)(github\.com|raw\.githubusercontent\.com|gist\.github\.com|x\.com|twitter\.com|t\.me|discord\.(gg|com)|linkedin\.com|youtube\.com|youtu\.be|medium\.com|mirror\.xyz|npmjs\.com|pypi\.org|reddit\.com|facebook\.com|instagram\.com|notion\.so|figma\.com|vercel\.com|netlify\.app|shields\.io|badgen\.net|licenses?\.|opensource\.org|creativecommons\.org|w3\.org|schema\.org|json-schema\.org|ietf\.org|rfc-editor\.org|wikipedia\.org)$/i;

/** El propio Basalt: se excluye para no auto-indexarse. */
const SELF_HOST = /basalt-n6lt\.onrender\.com$/i;

/**
 * Decimales de un asset, derivados del mapa del propio SDK (@x402/evm) en vez
 * de hardcodearse. Si el par cobra en un token que el SDK no conoce, devuelve
 * undefined y el precio se deja sin determinar.
 */
function decimalsForAsset(asset?: unknown, network?: unknown): number | undefined {
  if (typeof asset !== "string") return undefined;
  const target = asset.toLowerCase();
  for (const [net, entries] of Object.entries(DEFAULT_ASSETS)) {
    if (typeof network === "string" && network !== net) continue;
    for (const entry of entries) {
      if (entry.asset.toLowerCase() === target) return entry.decimals;
    }
  }
  return undefined;
}

export interface PeerResource {
  resource?: string;
  method?: string;
  path?: string;
  description?: string;
  /** USD por llamada. `undefined` cuando no se pudo determinar con certeza. */
  priceUsd?: number;
  /** Monto en unidades atómicas tal como lo publica el par, si lo publica. */
  amountRaw?: string;
  /** Contrato del token cobrado, si el par lo declara. */
  assetAddress?: string;
  network?: string;
  payTo?: string;
}

export type PeerKind =
  /** Publica un manifiesto x402 válido — el mejor caso. */
  | "x402_manifest"
  /** No publica manifiesto pero cobra: devolvió un 402 real. */
  | "x402_402"
  /** Responde, pero no se detectó x402 por ninguno de los dos caminos. */
  | "alive_no_x402"
  /** No respondió. */
  | "unreachable";

export interface Peer {
  origin: string;
  kind: PeerKind;
  /** Recursos declarados en el manifiesto, si hay. Topeado — ver resourceTotal. */
  resources: PeerResource[];
  /** Cuántos recursos declara en total, antes del tope. */
  resourceTotal?: number;
  network?: string;
  payTo?: string;
  /** Códigos HTTP vistos, para poder auditar la clasificación después. */
  seen: { manifest?: number; root?: number };
  note?: string;
}

async function get(url: string, timeoutMs: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": USER_AGENT, accept: "application/json, text/plain, */*" },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Extrae orígenes únicos (esquema + host) de un texto markdown. */
export function extractOrigins(markdown: string): string[] {
  const out = new Set<string>();
  const matches = markdown.match(/https?:\/\/[a-zA-Z0-9._~:/?#@!$&'()*+,;=%-]+/g) ?? [];
  for (const raw of matches) {
    let u: URL;
    try {
      u = new URL(raw.replace(/[).,;:'"\]]+$/, ""));
    } catch {
      continue;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    if (NON_SELLER_HOSTS.test(u.hostname) || SELF_HOST.test(u.hostname)) continue;
    // Solo el origen: dos rutas del mismo host son el mismo vendedor.
    out.add(`${u.protocol}//${u.host}`);
  }
  return [...out];
}

/** Junta las semillas de todos los directorios públicos. */
export async function collectSeeds(timeoutMs = 15_000): Promise<string[]> {
  const all = new Set<string>();
  for (const src of SEED_SOURCES) {
    const res = await get(src, timeoutMs);
    if (!res || !res.ok) continue;
    for (const origin of extractOrigins(await res.text())) all.add(origin);
  }
  return [...all].sort();
}

/** Normaliza los recursos de un manifiesto x402, tolerando variantes de forma. */
function readManifestResources(doc: unknown): { resources: PeerResource[]; network?: string; payTo?: string } {
  const empty = { resources: [] as PeerResource[] };
  if (!doc || typeof doc !== "object") return empty;
  const raw = (doc as Record<string, unknown>).resources;
  if (!Array.isArray(raw)) return empty;

  const resources: PeerResource[] = [];
  let network: string | undefined;
  let payTo: string | undefined;

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, any>;
    const accepts = Array.isArray(e.accepts) ? e.accepts[0] : e.accepts;

    // El precio puede venir de tres formas según el vendedor: un priceUsd
    // explícito (como el de Basalt desde el ciclo 10), un amount en unidades
    // atómicas, o un price "$0.003" de la forma de config.
    //
    // Los decimales NO se asumen: convertir un amount dividiendo por 1e6 a
    // ciegas convierte un token de 18 decimales en precios como
    // "$500000000000000000000" (visto de verdad en el primer rastreo). Si el
    // asset no se reconoce, el precio queda `undefined` y se conserva el crudo
    // — un precio desconocido es un dato honesto, uno inventado no.
    let priceUsd: number | undefined;
    let amountRaw: string | undefined;
    if (typeof e.priceUsd === "number" && Number.isFinite(e.priceUsd)) {
      priceUsd = e.priceUsd;
    } else if (accepts && typeof accepts.amount === "string" && /^\d+$/.test(accepts.amount)) {
      amountRaw = accepts.amount;
      const decimals = decimalsForAsset(accepts.asset, accepts.network);
      if (decimals !== undefined) priceUsd = Number(accepts.amount) / 10 ** decimals;
    } else if (accepts && typeof accepts.price === "string") {
      const n = Number(accepts.price.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(n)) priceUsd = n;
    }
    // Guardia de plausibilidad: por encima de esto no es un micropago, es un
    // dato roto del vendedor o un token que no supimos interpretar.
    if (priceUsd !== undefined && (priceUsd <= 0 || priceUsd > 10_000)) priceUsd = undefined;

    network = network ?? e.network ?? accepts?.network;
    payTo = payTo ?? e.payTo ?? accepts?.payTo;

    resources.push({
      resource: typeof e.resource === "string" ? e.resource : undefined,
      method: typeof e.method === "string" ? e.method : undefined,
      path: typeof e.path === "string" ? e.path : undefined,
      description: typeof e.description === "string" ? e.description.slice(0, 160) : undefined,
      priceUsd,
      amountRaw,
      assetAddress: typeof accepts?.asset === "string" ? accepts.asset : undefined,
      network: e.network ?? accepts?.network,
      payTo: e.payTo ?? accepts?.payTo,
    });
  }
  return { resources, network, payTo };
}

/**
 * Golpea un origen para ver si vende vía x402. Dos caminos, en orden de calidad
 * de la evidencia: el manifiesto declarado, y si no, un 402 real en la raíz.
 *
 * Verificar golpeando es la diferencia entre este índice y el de un scraper que
 * solo copia lo que dice un directorio — es exactamente el error que Cleared
 * Index cometió con Basalt.
 */
export async function probePeer(origin: string, timeoutMs = 8_000): Promise<Peer> {
  const peer: Peer = { origin, kind: "unreachable", resources: [], seen: {} };

  const man = await get(`${origin}/.well-known/x402.json`, timeoutMs);
  if (man) {
    peer.seen.manifest = man.status;
    if (man.ok) {
      try {
        const doc = await man.json();
        const { resources, network, payTo } = readManifestResources(doc);
        if (resources.length > 0) {
          peer.kind = "x402_manifest";
          peer.resourceTotal = resources.length;
          peer.resources = resources.slice(0, MAX_RESOURCES_PER_PEER);
          peer.network = network;
          peer.payTo = payTo;
          return peer;
        }
        peer.note = "manifiesto sin recursos utilizables";
      } catch {
        peer.note = "manifiesto no es JSON válido";
      }
    }
  }

  const root = await get(origin, timeoutMs);
  if (root) {
    peer.seen.root = root.status;
    // Un 402 en la raíz es prueba directa de que cobra, aunque no declare nada.
    if (root.status === 402 || root.headers.has("payment-required")) {
      peer.kind = "x402_402";
      return peer;
    }
    peer.kind = "alive_no_x402";
  }
  return peer;
}

/** Corre los probes con un tope de concurrencia, por cortesía con los pares. */
export async function probeAll(origins: string[], concurrency = 8, timeoutMs = 8_000): Promise<Peer[]> {
  const out: Peer[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, origins.length) }, async () => {
    while (next < origins.length) {
      const i = next++;
      out.push(await probePeer(origins[i], timeoutMs));
    }
  });
  await Promise.all(workers);
  return out;
}

export interface PeerRegistry {
  /** Cuándo se hizo el rastreo. Lo estampa quien corre el crawl, no este módulo. */
  crawledAt: string;
  seedCount: number;
  peers: Peer[];
}

/** Solo los pares donde hay evidencia real de que cobran vía x402. */
export function sellers(reg: PeerRegistry): Peer[] {
  return reg.peers.filter((p) => p.kind === "x402_manifest" || p.kind === "x402_402");
}
