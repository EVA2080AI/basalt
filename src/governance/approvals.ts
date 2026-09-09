import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

/**
 * Canal de aprobación humana. Cuando un gasto supera el umbral de la
 * política, no se bloquea para siempre — se deja pendiente aquí hasta que un
 * humano lo apruebe o lo rechace explícitamente con la CLI de gobierno.
 *
 * Una aprobación es de un solo uso: una vez consumida por un pago exitoso,
 * no sirve para autorizar un segundo pago aunque coincidan los mismos datos.
 */

const HOME_DIR = path.join(homedir(), ".automaton");
const APPROVALS_PATH = path.join(HOME_DIR, "approvals.json");

export type ApprovalStatus = "pending" | "approved" | "rejected" | "consumed";

export interface ApprovalRequest {
  toolId: string;
  counterparty: string;
  amountUsd: number;
  network: string;
  reason: string;
}

export interface ApprovalRecord extends ApprovalRequest {
  id: string;
  key: string;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
}

function ensureHomeDir(): void {
  if (!existsSync(HOME_DIR)) mkdirSync(HOME_DIR, { recursive: true, mode: 0o700 });
}

function loadAll(): ApprovalRecord[] {
  if (!existsSync(APPROVALS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(APPROVALS_PATH, "utf8"));
  } catch {
    return [];
  }
}

function saveAll(records: ApprovalRecord[]): void {
  ensureHomeDir();
  writeFileSync(APPROVALS_PATH, JSON.stringify(records, null, 2), { mode: 0o600 });
}

/** Identifica solicitudes equivalentes (mismo gasto exacto) para no duplicar pendientes. */
function requestKey(req: ApprovalRequest): string {
  return createHash("sha256").update(`${req.toolId}|${req.counterparty}|${req.amountUsd}|${req.network}`).digest("hex").slice(0, 16);
}

/**
 * Busca una aprobación utilizable para esta solicitud exacta. Si no existe,
 * crea una nueva pendiente. Nunca aprueba nada por sí misma.
 */
export function requestOrGetApproval(req: ApprovalRequest): ApprovalRecord {
  const key = requestKey(req);
  const records = loadAll();

  const usable = records.find((r) => r.key === key && (r.status === "pending" || r.status === "approved"));
  if (usable) return usable;

  const record: ApprovalRecord = {
    ...req,
    id: randomUUID().slice(0, 8),
    key,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  records.push(record);
  saveAll(records);
  return record;
}

/** Marca una aprobación ya usada como consumida, para que no autorice un segundo pago. */
export function consumeApproval(id: string): void {
  const records = loadAll();
  const record = records.find((r) => r.id === id);
  if (record) {
    record.status = "consumed";
    record.decidedAt = new Date().toISOString();
    saveAll(records);
  }
}

export function listPending(): ApprovalRecord[] {
  return loadAll().filter((r) => r.status === "pending");
}

export function decide(id: string, approve: boolean): ApprovalRecord | null {
  const records = loadAll();
  const record = records.find((r) => r.id === id);
  if (!record) return null;
  if (record.status !== "pending") return record;
  record.status = approve ? "approved" : "rejected";
  record.decidedAt = new Date().toISOString();
  saveAll(records);
  return record;
}
