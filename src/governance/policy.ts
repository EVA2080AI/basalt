import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Capa de gobierno: ningún pago x402 sale de Automaton sin pasar por aquí.
 * Esta es la pieza que el diseño de referencia de Conway no tiene.
 */

export interface PolicyConfig {
  network: "eip155:84532" | "eip155:8453"; // Base Sepolia (testnet) | Base Mainnet
  dailyCapUsd: number;
  perCallCapUsd: number;
  requireApprovalAboveUsd: number;
  toolCapsUsd: Record<string, number>;
  counterpartyAllowlist: string[] | "any";
}

export const DEFAULT_POLICY: PolicyConfig = {
  // Mainnet solo se habilita explícitamente con AUTOMATON_ALLOW_MAINNET=true.
  network: process.env.AUTOMATON_ALLOW_MAINNET === "true" ? "eip155:8453" : "eip155:84532",
  dailyCapUsd: Number(process.env.AUTOMATON_DAILY_CAP_USD ?? 5),
  perCallCapUsd: Number(process.env.AUTOMATON_PER_CALL_CAP_USD ?? 1),
  requireApprovalAboveUsd: Number(process.env.AUTOMATON_APPROVAL_THRESHOLD_USD ?? 2),
  toolCapsUsd: {},
  counterpartyAllowlist: "any",
};

interface LedgerEntry {
  timestamp: string;
  toolId: string;
  counterparty?: string;
  amountUsd: number;
  network: string;
}

const HOME_DIR = path.join(homedir(), ".automaton");
const LEDGER_PATH = path.join(HOME_DIR, "ledger.json");

function loadLedger(): LedgerEntry[] {
  if (!existsSync(LEDGER_PATH)) return [];
  try {
    return JSON.parse(readFileSync(LEDGER_PATH, "utf8"));
  } catch {
    return [];
  }
}

function saveLedger(entries: LedgerEntry[]): void {
  if (!existsSync(HOME_DIR)) mkdirSync(HOME_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(LEDGER_PATH, JSON.stringify(entries, null, 2), { mode: 0o600 });
}

function spentToday(entries: LedgerEntry[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return entries
    .filter((e) => e.timestamp.startsWith(today))
    .reduce((sum, e) => sum + e.amountUsd, 0);
}

export interface SpendRequest {
  toolId: string;
  counterparty?: string;
  amountUsd: number;
  network: string;
}

export type SpendVerdict =
  | { allowed: true; requiresHumanApproval: false }
  | { allowed: true; requiresHumanApproval: true; reason: string }
  | { allowed: false; requiresHumanApproval: false; reason: string };

/**
 * Evalúa un gasto ANTES de firmarlo. No mueve fondos ni conoce claves privadas.
 */
export function evaluateSpend(req: SpendRequest, policy: PolicyConfig = DEFAULT_POLICY): SpendVerdict {
  if (req.network !== policy.network) {
    return {
      allowed: false,
      requiresHumanApproval: false,
      reason: `Red '${req.network}' no coincide con la red autorizada por política ('${policy.network}').`,
    };
  }

  if (policy.counterpartyAllowlist !== "any" && req.counterparty) {
    if (!policy.counterpartyAllowlist.includes(req.counterparty)) {
      return {
        allowed: false,
        requiresHumanApproval: false,
        reason: `Contraparte '${req.counterparty}' no está en la allowlist.`,
      };
    }
  }

  const perToolCap = policy.toolCapsUsd[req.toolId] ?? policy.perCallCapUsd;
  if (req.amountUsd > perToolCap) {
    return {
      allowed: false,
      requiresHumanApproval: false,
      reason: `Monto USD ${req.amountUsd} excede el tope por llamada para '${req.toolId}' (USD ${perToolCap}).`,
    };
  }

  const ledger = loadLedger();
  const spentSoFar = spentToday(ledger);
  if (spentSoFar + req.amountUsd > policy.dailyCapUsd) {
    return {
      allowed: false,
      requiresHumanApproval: false,
      reason: `Tope diario excedido: gastado USD ${spentSoFar.toFixed(2)} + USD ${req.amountUsd} > tope USD ${policy.dailyCapUsd}.`,
    };
  }

  if (req.amountUsd > policy.requireApprovalAboveUsd) {
    return {
      allowed: true,
      requiresHumanApproval: true,
      reason: `Monto USD ${req.amountUsd} supera el umbral de aprobación humana (USD ${policy.requireApprovalAboveUsd}).`,
    };
  }

  return { allowed: true, requiresHumanApproval: false };
}

/** Registra un gasto ya ejecutado (llamar solo después de una liquidación real). */
export function recordSpend(req: SpendRequest): void {
  const ledger = loadLedger();
  ledger.push({
    timestamp: new Date().toISOString(),
    toolId: req.toolId,
    counterparty: req.counterparty,
    amountUsd: req.amountUsd,
    network: req.network,
  });
  saveLedger(ledger);
}

export function spendSummary(policy: PolicyConfig = DEFAULT_POLICY) {
  const ledger = loadLedger();
  return {
    spentToday: spentToday(ledger),
    dailyCapUsd: policy.dailyCapUsd,
    network: policy.network,
    totalEntries: ledger.length,
  };
}
