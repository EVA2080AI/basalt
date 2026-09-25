/**
 * Rastrea el ecosistema x402 y deja el resultado en peers-snapshot.json.
 *
 * Se corre a mano (o desde el pulso del server, que reusa el mismo módulo). El
 * snapshot commiteado es lo que sirve el producto x402-discover en arranque
 * frío: así una request pagada nunca depende de que un tercero esté vivo en ese
 * instante — el rastreo es asincrónico, la venta no.
 *
 *   npx tsx scripts/crawl-peers.ts [--limit N]
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { collectSeeds, probeAll, sellers, type PeerRegistry } from "../src/discovery/peers.js";

const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : undefined;

const t0 = Date.now();
console.log("[crawl] juntando semillas de los directorios públicos…");
const seedsAll = await collectSeeds();
const seeds = limit ? seedsAll.slice(0, limit) : seedsAll;
console.log(`[crawl] ${seedsAll.length} orígenes únicos${limit ? ` (probando ${seeds.length})` : ""}`);

console.log("[crawl] golpeando cada origen (solo lectura, nunca paga)…");
const peers = await probeAll(seeds);

// Solo se persisten los pares con evidencia real de que cobran. Los ~270
// orígenes que no venden nada vía x402 son ruido para el producto y pesaban
// 350 KB en el repo; el conteo de semillas queda igual para no perder la escala
// real del rastreo.
const verified = peers
  .filter((p) => p.kind === "x402_manifest" || p.kind === "x402_402")
  .sort((a, b) => a.origin.localeCompare(b.origin));

const registry: PeerRegistry = {
  crawledAt: new Date().toISOString(),
  seedCount: seedsAll.length,
  peers: verified,
};

const byKind = peers.reduce<Record<string, number>>((acc, p) => {
  acc[p.kind] = (acc[p.kind] ?? 0) + 1;
  return acc;
}, {});

const out = path.join(process.cwd(), "peers-snapshot.json");
// Compacto a propósito: es un archivo de datos que se commitea, no algo
// que se lea a mano.
writeFileSync(out, JSON.stringify(registry) + "\n");

const found = sellers(registry);
console.log(`\n[crawl] listo en ${Math.round((Date.now() - t0) / 1000)}s → ${out}`);
console.log("[crawl] por clasificación:", byKind);
console.log(`[crawl] VENDEDORES x402 VERIFICADOS: ${found.length}`);
console.log(`[crawl]   con manifiesto: ${found.filter((p) => p.kind === "x402_manifest").length}`);
console.log(`[crawl]   solo 402 en la raíz: ${found.filter((p) => p.kind === "x402_402").length}`);
console.log(`[crawl] recursos totales descubiertos: ${found.reduce((n, p) => n + p.resources.length, 0)}`);
