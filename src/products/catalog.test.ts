import { test } from "node:test";
import assert from "node:assert/strict";
import { Ajv } from "ajv";
import type { Request, Response } from "express";
import { PRODUCTS } from "./catalog.js";
import { loadSnapshot } from "../discovery/registry.js";

/**
 * Invariantes del catálogo entero, y el contrato de cada producto contra su
 * propia documentación.
 *
 * Por qué existe: durante meses hubo 21 productos y un solo archivo de test (el
 * de governance). Cada producto declara `inputSchema`/`outputSchema` y nadie
 * verificaba que los ejemplos publicados — los que un comprador lee del
 * manifiesto y del OpenAPI antes de pagar — coincidieran con lo que el handler
 * devuelve de verdad. Un ejemplo que miente es peor que no tener ejemplo: el
 * comprador arma el body, paga, y recibe otra cosa.
 *
 * Los 5 productos que hacen I/O de red (domain-check, email-check, ssl-check,
 * url-metadata, pdf-extract) se excluyen del smoke test a propósito: un test que
 * depende de RDAP o de un TLS handshake falla por motivos ajenos al código y
 * termina ignorándose. Sus invariantes de catálogo sí se verifican.
 */

const NETWORK_BOUND = new Set([
  "domain-check",
  "email-check",
  "ssl-check",
  "url-metadata",
  "pdf-extract",
]);

// El índice de pares alimenta a x402-discover: sin esto su smoke test corre
// sobre un registro vacío y no prueba nada.
loadSnapshot();

const ajv = new Ajv({ strict: false, allErrors: true });

function validate(schema: unknown, data: unknown): string | null {
  const fn = ajv.compile(schema as object);
  if (fn(data)) return null;
  return (fn.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ");
}

/** Mínimo Response de Express que necesitan los handlers. */
function fakeRes() {
  const captured: { code: number; body: unknown } = { code: 200, body: undefined };
  const res = {
    status(c: number) {
      captured.code = c;
      return res;
    },
    json(b: unknown) {
      captured.body = b;
      return res;
    },
    type() {
      return res;
    },
    send(b: unknown) {
      captured.body = b;
      return res;
    },
    set() {
      return res;
    },
  };
  return { res: res as unknown as Response, captured };
}

test("el catálogo no tiene ids ni rutas duplicadas", () => {
  const ids = PRODUCTS.map((p) => p.id);
  const paths = PRODUCTS.map((p) => `${p.method} ${p.path}`);
  assert.equal(new Set(ids).size, ids.length, `ids duplicados: ${ids.join(", ")}`);
  assert.equal(new Set(paths).size, paths.length, `rutas duplicadas: ${paths.join(", ")}`);
});

test("cada producto tiene los campos que el manifiesto y el OpenAPI publican", () => {
  for (const p of PRODUCTS) {
    assert.ok(p.id && /^[a-z0-9-]+$/.test(p.id), `id inválido: ${p.id}`);
    assert.ok(p.path.startsWith("/"), `${p.id}: path debe empezar con /`);
    assert.ok(p.method === "GET" || p.method === "POST", `${p.id}: method inválido`);
    assert.ok(Number.isFinite(p.priceUsd) && p.priceUsd > 0, `${p.id}: priceUsd debe ser > 0`);
    assert.ok(p.description.trim().length > 20, `${p.id}: descripción demasiado corta`);
    assert.ok(
      /^\d{4}-\d{2}-\d{2}$/.test(p.launchedAt) && !Number.isNaN(Date.parse(p.launchedAt)),
      `${p.id}: launchedAt debe ser YYYY-MM-DD válido, es "${p.launchedAt}"`,
    );
    assert.equal(typeof p.handler, "function", `${p.id}: handler ausente`);
  }
});

test("cada producto tiene descripción en español, y sin huérfanas", () => {
  for (const p of PRODUCTS) {
    assert.ok(
      p.descriptionEs && p.descriptionEs.trim().length > 20,
      `${p.id}: falta descriptionEs — la página /es caería al inglés en silencio`,
    );
  }
});

test("el precio se puede expresar en unidades atómicas de USDC sin perder precisión", () => {
  for (const p of PRODUCTS) {
    const atomic = p.priceUsd * 1e6;
    assert.ok(
      Math.abs(atomic - Math.round(atomic)) < 1e-6,
      `${p.id}: $${p.priceUsd} no cae en un entero de unidades atómicas (${atomic})`,
    );
    assert.ok(Math.round(atomic) > 0, `${p.id}: el precio redondea a 0 unidades atómicas`);
  }
});

test("el inputExample publicado valida contra el inputSchema publicado", () => {
  for (const p of PRODUCTS) {
    if (!p.inputSchema) continue;
    assert.ok(p.inputExample, `${p.id}: declara inputSchema pero no inputExample`);
    const err = validate(p.inputSchema, p.inputExample);
    assert.equal(err, null, `${p.id}: el inputExample no valida — ${err}`);
  }
});

test("el outputExample publicado valida contra el outputSchema publicado", () => {
  for (const p of PRODUCTS) {
    if (!p.outputSchema) continue;
    assert.ok(p.outputExample, `${p.id}: declara outputSchema pero no outputExample`);
    const err = validate(p.outputSchema, p.outputExample);
    assert.equal(err, null, `${p.id}: el outputExample no valida — ${err}`);
  }
});

// El test que importa: lo que el handler devuelve de verdad, contra lo que el
// producto promete en su outputSchema. Corre con el inputExample del propio
// producto, así que es el mismo camino que haría un comprador leyendo el
// OpenAPI.
for (const p of PRODUCTS) {
  if (NETWORK_BOUND.has(p.id)) continue;
  test(`${p.id}: el handler cumple su outputSchema con su propio inputExample`, async () => {
    const { res, captured } = fakeRes();
    await p.handler({ body: p.inputExample ?? {} } as Request, res);

    assert.equal(captured.code, 200, `respondió ${captured.code} con su propio ejemplo: ${JSON.stringify(captured.body)}`);
    assert.notEqual(captured.body, undefined, "el handler no respondió nada");

    if (p.outputSchema) {
      const err = validate(p.outputSchema, captured.body);
      assert.equal(err, null, `la respuesta real no cumple el outputSchema — ${err}`);
    }
  });
}

test("un body vacío no revienta: o responde 400 con mensaje, o 200 válido", async () => {
  for (const p of PRODUCTS) {
    if (NETWORK_BOUND.has(p.id)) continue;
    const { res, captured } = fakeRes();
    await p.handler({ body: {} } as Request, res);

    assert.ok(
      captured.code === 400 || captured.code === 200,
      `${p.id}: respondió ${captured.code} a un body vacío`,
    );
    if (captured.code === 400) {
      const body = captured.body as { error?: string };
      assert.ok(
        typeof body?.error === "string" && body.error.length > 0,
        `${p.id}: 400 sin un campo 'error' que explique qué falta`,
      );
    }
  }
});
