import { test } from "node:test";
import assert from "node:assert/strict";
import { PaymentRequirementsV2Schema } from "@x402/core/schemas";
import { acceptsFor, paymentRequirementsFor } from "./x402Server.js";
import { DEFAULT_POLICY } from "../governance/policy.js";

/**
 * La distinción que rompió un despliegue y que solo se atrapó por una revisión
 * adversarial: la forma de CONFIG del middleware y la forma de WIRE del 402 real
 * NO son la misma, y publicar la primera donde va la segunda hace que cualquier
 * indexador que valide contra el esquema oficial descarte el recurso.
 *
 * Esto estaba escrito como comentario en el código y como paso manual en
 * OPERATING.md. Un comentario no falla el build; este test sí. Es la diferencia
 * entre una disciplina que depende de que alguien se acuerde y una que no.
 */

const PAY_TO = "0x1816489D28C8C9fD2EdE2d38B1A52EedA54e8FDb";

function route(priceUsd: number) {
  return {
    id: "test-tool",
    method: "POST" as const,
    path: "/test-tool",
    priceUsd,
    description: "Solo para tests.",
  };
}

test("paymentRequirementsFor produce la forma de WIRE que el esquema oficial acepta", () => {
  const req = paymentRequirementsFor(route(0.003), PAY_TO);
  const parsed = PaymentRequirementsV2Schema.safeParse(req);
  assert.equal(
    parsed.success,
    true,
    `no valida: ${JSON.stringify((parsed as { error?: unknown }).error ?? {})}`,
  );
});

test("acceptsFor produce la forma de CONFIG, que el esquema oficial RECHAZA", () => {
  // Este test parece raro — afirma que algo NO valida. Es a propósito: si
  // alguien "arregla" acceptsFor para que valide, o cambia el manifiesto para
  // publicar esta forma, el test rojo explica por qué no debe hacerse.
  const cfg = acceptsFor(route(0.003), PAY_TO);
  const parsed = PaymentRequirementsV2Schema.safeParse(cfg);
  assert.equal(
    parsed.success,
    false,
    "la forma de config empezó a validar como wire: revisar si el SDK cambió antes de tocar el manifiesto",
  );
});

test("el manifiesto nunca publica la forma de config", () => {
  const cfg = acceptsFor(route(0.01), PAY_TO) as unknown as Record<string, unknown>;
  const wire = paymentRequirementsFor(route(0.01), PAY_TO) as unknown as Record<string, unknown>;

  // `price` es el campo delator: existe en config y no en el estándar de wire.
  assert.ok("price" in cfg, "la forma de config debería llevar price");
  assert.ok(!("price" in wire), "la forma de wire no debe llevar price");
  for (const required of ["amount", "asset", "extra"]) {
    assert.ok(required in wire, `la forma de wire debe llevar ${required}`);
    assert.ok(!(required in cfg), `la forma de config no lleva ${required}`);
  }
});

test("el precio se convierte a unidades atómicas sin errores de coma flotante", () => {
  const cases: Array<[number, string]> = [
    [0.002, "2000"],
    [0.003, "3000"],
    [0.005, "5000"],
    [0.01, "10000"],
    [0.02, "20000"],
    [0.15, "150000"],
    [1, "1000000"],
  ];
  for (const [usd, atomic] of cases) {
    const req = paymentRequirementsFor(route(usd), PAY_TO) as { amount: string };
    assert.equal(req.amount, atomic, `$${usd} debería ser ${atomic} unidades atómicas`);
  }
});

test("asset y extra se derivan de la red configurada, no se hardcodean", () => {
  const req = paymentRequirementsFor(route(0.002), PAY_TO) as {
    network: string;
    asset: string;
    extra: { name: string; version: string };
  };
  assert.equal(req.network, DEFAULT_POLICY.network);
  assert.match(req.asset, /^0x[0-9a-fA-F]{40}$/, "asset debe ser una dirección EVM");
  assert.equal(req.extra.version, "2");

  // El nombre EIP-712 del token difiere por red: en Base mainnet es "USD Coin"
  // y en Base Sepolia "USDC". Hardcodear uno rompe el otro en silencio, y una
  // firma armada con el nombre equivocado falla en verificación.
  const expected = DEFAULT_POLICY.network === "eip155:8453" ? "USD Coin" : "USDC";
  assert.equal(req.extra.name, expected, `extra.name para ${DEFAULT_POLICY.network}`);
});

test("payTo es exactamente la dirección que se le pasa", () => {
  const wire = paymentRequirementsFor(route(0.002), PAY_TO) as { payTo: string };
  const cfg = acceptsFor(route(0.002), PAY_TO) as { payTo: string };
  assert.equal(wire.payTo, PAY_TO);
  assert.equal(cfg.payTo, PAY_TO);
});
