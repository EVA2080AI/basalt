import { test } from "node:test";
import assert from "node:assert/strict";
import { nextAction, type ToolStat } from "./introspect.js";

/**
 * La escalera de prioridades de OPERATING.md, como código verificable.
 *
 * El comportamiento que más importa acá no es elegir bien cuando hay datos: es
 * NEGARSE A CONCLUIR cuando no los hay. Los contadores viven en RAM y el proceso
 * de Render muere cada ~15 min sin tráfico, así que "cero probes" casi nunca
 * significa "nadie lo quiso" — significa "todavía no se midió". Un panel ingenuo
 * leería eso como una señal y mandaría un ciclo entero a resolver un problema
 * inexistente.
 */

function tool(id: string, probes: number, paid: number): ToolStat {
  const status = paid > 0 ? "converting" : probes > 0 ? "probed_not_paid" : "no_traffic";
  return { id, path: `/${id}`, probes, paid, status };
}

const DAY = 86_400;

test("algo roto gana a todo lo demás", () => {
  const r = nextAction({
    tools: [tool("a", 500, 0)], // habría sido P2
    brokenSignals: ["el manifiesto publica 20 recursos pero el catálogo tiene 21"],
    peerIndexStale: true,
    uptimeSeconds: DAY,
  });
  assert.equal(r.priority, 1);
  assert.match(r.action, /Arreglar antes que nada/);
  assert.match(r.action, /manifiesto/);
});

test("tráfico sin pago es P2, y nombra la herramienta con más probes", () => {
  const r = nextAction({
    tools: [tool("poco", 3, 0), tool("mucho", 91, 0), tool("nada", 0, 0)],
    brokenSignals: [],
    peerIndexStale: false,
    uptimeSeconds: DAY,
  });
  assert.equal(r.priority, 2);
  assert.match(r.action, /mucho/, "debe señalar la de más probes, no la primera de la lista");
  assert.match(r.action, /91 probes/);
});

test("un proceso recién nacido con todo en cero se niega a concluir", () => {
  const r = nextAction({
    tools: [tool("a", 0, 0), tool("b", 0, 0)],
    brokenSignals: [],
    peerIndexStale: false,
    uptimeSeconds: 42,
  });
  assert.match(r.action, /Esperar datos/);
  assert.match(r.because, /memoria/, "debe explicar que el cero es falta de medición, no de interés");
});

test("con el proceso ya maduro y cero pagos, la palanca es descubribilidad", () => {
  const r = nextAction({
    tools: [tool("a", 0, 0), tool("b", 0, 0)],
    brokenSignals: [],
    peerIndexStale: false,
    uptimeSeconds: 5 * DAY,
  });
  assert.equal(r.priority, 3);
  assert.match(r.action, /descubribilidad/);
});

test("un índice vencido frena cualquier conclusión sobre el mercado", () => {
  const r = nextAction({
    tools: [tool("a", 0, 0)],
    brokenSignals: [],
    peerIndexStale: true,
    uptimeSeconds: 5 * DAY,
  });
  assert.equal(r.priority, 3);
  assert.match(r.action, /Refrescar el índice/);
});

test("con algo convirtiendo y sin fricción, recién ahí se construye", () => {
  const r = nextAction({
    tools: [tool("a", 20, 4), tool("b", 0, 0)],
    brokenSignals: [],
    peerIndexStale: false,
    uptimeSeconds: 5 * DAY,
  });
  assert.equal(r.priority, 4);
  assert.match(r.action, /Producto nuevo|mejorar/);
});

test("la prioridad siempre es uno de los cuatro escalones", () => {
  const combos = [0, 1, 50].flatMap((probes) =>
    [0, 1].flatMap((paid) =>
      [true, false].flatMap((stale) =>
        [10, DAY].map((up) =>
          nextAction({
            tools: [tool("a", probes, paid)],
            brokenSignals: [],
            peerIndexStale: stale,
            uptimeSeconds: up,
          }),
        ),
      ),
    ),
  );
  for (const r of combos) {
    assert.ok([1, 2, 3, 4].includes(r.priority), `prioridad fuera de rango: ${r.priority}`);
    assert.ok(r.action.length > 10, "toda acción debe decir algo concreto");
    assert.ok(r.because.length > 10, "toda acción debe explicar por qué");
  }
});
