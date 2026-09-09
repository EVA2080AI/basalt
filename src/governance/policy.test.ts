import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// El override de AUTOMATON_LEDGER_PATH debe fijarse ANTES de importar el
// módulo, porque las funciones lo leen en cada llamada pero el módulo se
// carga una sola vez por proceso de test.
const testDir = mkdtempSync(path.join(tmpdir(), "basalt-policy-test-"));
process.env.AUTOMATON_LEDGER_PATH = path.join(testDir, "ledger.json");

const { evaluateSpend, recordSpend, spendSummary } = await import("./policy.js");
import type { PolicyConfig } from "./policy.js";

const BASE_POLICY: PolicyConfig = {
  network: "eip155:84532",
  dailyCapUsd: 5,
  perCallCapUsd: 1,
  requireApprovalAboveUsd: 2,
  toolCapsUsd: {},
  counterpartyAllowlist: "any",
};

const REQ = {
  toolId: "url-metadata-extract",
  counterparty: "0xabc",
  amountUsd: 0.5,
  network: "eip155:84532",
};

after(() => rmSync(testDir, { recursive: true, force: true }));

beforeEach(() => {
  rmSync(path.join(testDir, "ledger.json"), { force: true });
});

test("aprueba un gasto normal dentro de los topes", () => {
  const verdict = evaluateSpend(REQ, BASE_POLICY);
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.requiresHumanApproval, false);
});

test("bloquea si la red no coincide con la política", () => {
  const verdict = evaluateSpend({ ...REQ, network: "eip155:8453" }, BASE_POLICY);
  assert.equal(verdict.allowed, false);
});

test("bloquea si la contraparte no está en la allowlist", () => {
  const policy: PolicyConfig = { ...BASE_POLICY, counterpartyAllowlist: ["0xdef"] };
  const verdict = evaluateSpend(REQ, policy);
  assert.equal(verdict.allowed, false);
});

test("bloquea si el monto excede el tope por llamada", () => {
  const verdict = evaluateSpend({ ...REQ, amountUsd: 1.5 }, BASE_POLICY);
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason!, /tope por llamada/);
});

test("respeta un tope específico por herramienta por encima del tope general", () => {
  const policy: PolicyConfig = { ...BASE_POLICY, perCallCapUsd: 1, toolCapsUsd: { "url-metadata-extract": 0.1 } };
  const verdict = evaluateSpend({ ...REQ, amountUsd: 0.5 }, policy);
  assert.equal(verdict.allowed, false, "0.5 > 0.1 del tope específico de la herramienta, debe bloquear");
});

test("exige aprobación humana por encima del umbral, pero permite el gasto", () => {
  const verdict = evaluateSpend({ ...REQ, amountUsd: 3 }, { ...BASE_POLICY, perCallCapUsd: 10 });
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.requiresHumanApproval, true);
});

test("bloquea al superar el tope diario acumulado, aunque el monto individual sea válido", () => {
  recordSpend({ ...REQ, amountUsd: 4.7 });
  const verdict = evaluateSpend({ ...REQ, amountUsd: 0.5 }, BASE_POLICY);
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason!, /Tope diario/);
});

test("spendSummary refleja lo gastado hoy", () => {
  recordSpend({ ...REQ, amountUsd: 0.3 });
  recordSpend({ ...REQ, amountUsd: 0.2 });
  const summary = spendSummary(BASE_POLICY);
  assert.equal(summary.spentToday, 0.5);
  assert.equal(summary.totalEntries, 2);
});
