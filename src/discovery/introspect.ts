import { getRegistry, registrySummary } from "./registry.js";
import { sellers } from "./peers.js";

/**
 * El veredicto de Basalt sobre sí mismo, calculado con reglas.
 *
 * Por qué con reglas y no con un LLM: razonar con un modelo cuesta plata por
 * pensamiento, y `CLAUDE.md` mantiene el costo operativo cerca de cero a
 * propósito. Esto es lo que sí se puede hacer gratis y corriendo 24/7 — medir,
 * comparar contra el mercado, y aplicar la escalera de prioridades de
 * OPERATING.md. No reemplaza a una sesión razonando; le entrega el diagnóstico
 * ya hecho para que no tenga que rearmarlo.
 *
 * No toma ninguna acción. Diagnostica.
 */

export interface ToolStat {
  id: string;
  path: string;
  probes: number;
  paid: number;
  status: "no_traffic" | "probed_not_paid" | "converting";
}

export interface CatalogEntry {
  id: string;
  path: string;
  priceUsd: number;
}

export interface Undercut {
  tool: string;
  basaltPriceUsd: number;
  cheapestPeerUsd: number;
  peerOrigin: string;
  peerPath?: string;
}

export interface NextAction {
  /** 1 es lo más urgente. Es la escalera de OPERATING.md, no una opinión. */
  priority: 1 | 2 | 3 | 4;
  action: string;
  because: string;
}

/**
 * Cruza el catálogo de Basalt contra el índice de pares. El match es por el
 * primer token del id (`timezone-convert` → `timezone`) buscado en el path del
 * par: es grueso a propósito, porque los vendedores nombran distinto y un match
 * exacto no encontraría nada. Solo se comparan precios determinables.
 */
export function competition(catalog: CatalogEntry[]): {
  undercut: Undercut[];
  matched: string[];
  uncontested: string[];
} {
  const peers = sellers(getRegistry());
  const undercut: Undercut[] = [];
  const matched: string[] = [];
  const uncontested: string[] = [];

  for (const tool of catalog) {
    const token = tool.id.split("-")[0].toLowerCase();
    let best: { priceUsd: number; origin: string; path?: string } | null = null;

    for (const peer of peers) {
      for (const r of peer.resources) {
        if (typeof r.priceUsd !== "number") continue;
        const path = (r.path ?? r.resource ?? "").toLowerCase();
        if (!path.includes(token)) continue;
        if (!best || r.priceUsd < best.priceUsd) {
          best = { priceUsd: r.priceUsd, origin: peer.origin, path: r.path };
        }
      }
    }

    if (!best) {
      uncontested.push(tool.id);
      continue;
    }
    matched.push(tool.id);
    if (best.priceUsd < tool.priceUsd) {
      undercut.push({
        tool: tool.id,
        basaltPriceUsd: tool.priceUsd,
        cheapestPeerUsd: best.priceUsd,
        peerOrigin: best.origin,
        peerPath: best.path,
      });
    }
  }
  return { undercut, matched, uncontested };
}

/** En qué percentil de precio del mercado cae un monto. */
export function pricePercentile(usd: number): number | null {
  const prices = sellers(getRegistry())
    .flatMap((p) => p.resources)
    .map((r) => r.priceUsd)
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => a - b);
  if (prices.length === 0) return null;
  return Math.round((prices.filter((p) => p < usd).length / prices.length) * 100);
}

/**
 * Elige la próxima acción siguiendo la escalera de OPERATING.md: primero lo
 * roto, después la fricción antes del pago, después descubribilidad, y recién
 * al final catálogo nuevo.
 */
export function nextAction(args: {
  tools: ToolStat[];
  brokenSignals: string[];
  peerIndexStale: boolean;
  uptimeSeconds: number;
}): NextAction {
  const { tools, brokenSignals, peerIndexStale, uptimeSeconds } = args;

  if (brokenSignals.length > 0) {
    return {
      priority: 1,
      action: `Arreglar antes que nada: ${brokenSignals.join("; ")}`,
      because: "Algo roto va primero que cualquier cosa nueva — puede costar un listado ya conseguido.",
    };
  }

  const probed = tools.filter((t) => t.status === "probed_not_paid").sort((a, b) => b.probes - a.probes);
  if (probed.length > 0) {
    const top = probed[0];
    return {
      priority: 2,
      action: `Reducir la fricción de ${top.id} (${top.probes} probes, 0 pagos): revisar claridad de la descripción, inputExample, outputSchema y precio.`,
      because: `${probed.length} herramienta(s) reciben tráfico y ninguna liquida. Es la señal más concreta que hay: alguien llegó y algo lo frenó justo antes de pagar.`,
    };
  }

  // Un proceso recién nacido no da evidencia de nada: el contador vive en RAM.
  if (uptimeSeconds < 3600 && tools.every((t) => t.probes === 0)) {
    return {
      priority: 4,
      action: "Esperar datos antes de decidir.",
      because: `El proceso tiene ${uptimeSeconds}s de vida y los contadores viven en memoria — cero probes acá no significa cero interés, significa que todavía no se midió nada.`,
    };
  }

  if (peerIndexStale) {
    return {
      priority: 3,
      action: "Refrescar el índice de pares (npx tsx scripts/crawl-peers.ts) antes de concluir sobre el mercado.",
      because: "El índice está viejo: cualquier conclusión sobre competencia o descubribilidad se apoyaría en datos vencidos.",
    };
  }

  if (tools.every((t) => t.paid === 0)) {
    return {
      priority: 3,
      action: "Trabajar descubribilidad, no catálogo: que más agentes compradores sepan que Basalt existe.",
      because: "Ninguna herramienta liquidó nunca un pago. Con cero conversión, el producto N+1 no cambia la realidad — el cuello de botella está antes.",
    };
  }

  return {
    priority: 4,
    action: "Producto nuevo, o mejorar uno existente con lo que muestren los datos.",
    because: "Nada roto, sin fricción detectable y con al menos una herramienta convirtiendo.",
  };
}

export interface Introspection {
  at: string;
  process: { bornAt: string; uptimeSeconds: number; heartbeats: number };
  catalog: { tools: number };
  conversion: {
    converting: string[];
    probedNotPaid: Array<{ id: string; probes: number }>;
    noTraffic: string[];
  };
  market: {
    indexCrawledAt: string;
    sellersVerified: number;
    resourcesIndexed: number;
    resourcesWithPrice: number;
    stale: boolean;
    cheapestBasaltPricePercentile: number | null;
    undercut: Undercut[];
    uncontested: string[];
  };
  health: { signals: string[] };
  nextAction: NextAction;
  note: string;
}

/** Cuánto puede envejecer el índice antes de dejar de ser evidencia. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function introspect(args: {
  now: Date;
  bornAt: string;
  uptimeSeconds: number;
  heartbeats: number;
  tools: ToolStat[];
  catalog: CatalogEntry[];
  manifestResourceCount: number;
}): Introspection {
  const { now, bornAt, uptimeSeconds, heartbeats, tools, catalog, manifestResourceCount } = args;
  const summary = registrySummary();

  const crawledAtMs = Date.parse(summary.crawledAt);
  const stale = !Number.isFinite(crawledAtMs) || now.getTime() - crawledAtMs > STALE_AFTER_MS;

  // Señales de algo roto que se pueden ver desde adentro, sin auto-request.
  const signals: string[] = [];
  if (manifestResourceCount !== catalog.length) {
    signals.push(
      `el manifiesto publica ${manifestResourceCount} recursos pero el catálogo tiene ${catalog.length}`,
    );
  }
  if (summary.sellersVerified === 0) signals.push("el índice de pares está vacío");
  if (summary.lastRefresh?.error) signals.push(`el último rastreo falló: ${summary.lastRefresh.error}`);

  const cheapest = catalog.length > 0 ? Math.min(...catalog.map((c) => c.priceUsd)) : 0;
  const comp = competition(catalog);

  return {
    at: now.toISOString(),
    process: { bornAt, uptimeSeconds, heartbeats },
    catalog: { tools: catalog.length },
    conversion: {
      converting: tools.filter((t) => t.status === "converting").map((t) => t.id),
      probedNotPaid: tools
        .filter((t) => t.status === "probed_not_paid")
        .sort((a, b) => b.probes - a.probes)
        .map((t) => ({ id: t.id, probes: t.probes })),
      noTraffic: tools.filter((t) => t.status === "no_traffic").map((t) => t.id),
    },
    market: {
      indexCrawledAt: summary.crawledAt,
      sellersVerified: summary.sellersVerified,
      resourcesIndexed: summary.resourcesIndexed,
      resourcesWithPrice: summary.resourcesWithPrice,
      stale,
      cheapestBasaltPricePercentile: pricePercentile(cheapest),
      undercut: comp.undercut,
      uncontested: comp.uncontested,
    },
    health: { signals },
    nextAction: nextAction({ tools, brokenSignals: signals, peerIndexStale: stale, uptimeSeconds }),
    note:
      "Diagnóstico por reglas, no por un LLM: razonar con un modelo cuesta por llamada y el costo operativo se mantiene en cero a propósito. No toma ninguna acción — es el insumo del paso 2 de OPERATING.md.",
  };
}
