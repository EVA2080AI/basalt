import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { loadAccount } from "../wallet/wallet.js";
import { DEFAULT_POLICY, evaluateSpend, recordSpend } from "../governance/policy.js";
import { requestOrGetApproval, consumeApproval } from "../governance/approvals.js";

/**
 * Automaton pagando a otros vía x402. La política se evalúa ANTES de construir
 * un fetch capaz de pagar — nunca se le da a la librería de pago un monto que
 * la política no haya aprobado primero.
 */

interface PaymentRequirement {
  scheme: string;
  network: string;
  amount: string; // unidades atómicas del token (USDC = 6 decimales)
  payTo: string;
  asset?: string;
}

interface X402Challenge {
  x402Version: number;
  accepts: PaymentRequirement[];
}

/**
 * El reto de pago x402 v2 viaja en el header de respuesta PAYMENT-REQUIRED
 * (JSON codificado en base64), no en el body — confirmado contra un servidor
 * real de Automaton, no asumido de la documentación.
 */
function parseChallenge(res: Response): X402Challenge {
  const header = res.headers.get("PAYMENT-REQUIRED") ?? res.headers.get("payment-required");
  if (!header) throw new Error("Respuesta 402 sin header PAYMENT-REQUIRED.");
  return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
}

function atomicToUsd(amount: string): number {
  // Asume USDC (6 decimales), que es el activo estándar de x402 en Base.
  return Number(amount) / 1_000_000;
}

export interface GatedFetchOptions extends RequestInit {
  toolId: string;
}

export interface GatedFetchResult {
  response: Response;
  paid: boolean;
  amountUsd?: number;
}

/** Se lanza cuando un gasto necesita aprobación humana y todavía no la tiene. */
export class ApprovalPendingError extends Error {
  constructor(public readonly approvalId: string, amountUsd: number) {
    super(
      `Pago de USD ${amountUsd} requiere aprobación humana. Pendiente con id '${approvalId}'. ` +
        `Revisa con \`npm run governance:pending\` y decide con \`npm run governance:approve -- ${approvalId}\`.`,
    );
    this.name = "ApprovalPendingError";
  }
}

export class ApprovalRejectedError extends Error {
  constructor(approvalId: string) {
    super(`Pago rechazado por un humano (aprobación '${approvalId}').`);
    this.name = "ApprovalRejectedError";
  }
}

/**
 * Hace un fetch. Si el recurso es gratis, lo devuelve tal cual. Si exige pago
 * x402, evalúa el monto contra la política de gasto ANTES de pagar. Si la
 * política bloquea o exige aprobación humana, no se ejecuta ningún pago.
 */
export async function gatedFetch(url: string, opts: GatedFetchOptions): Promise<GatedFetchResult> {
  const { toolId, ...init } = opts;

  const probe = await fetch(url, init);
  if (probe.status !== 402) {
    return { response: probe, paid: false };
  }

  const challenge = parseChallenge(probe);
  const requirement = challenge.accepts[0];
  if (!requirement) throw new Error(`Respuesta 402 sin 'accepts' en ${url}`);

  const amountUsd = atomicToUsd(requirement.amount);

  const verdict = evaluateSpend(
    {
      toolId,
      counterparty: requirement.payTo,
      amountUsd,
      network: requirement.network,
    },
    DEFAULT_POLICY,
  );

  if (!verdict.allowed) {
    throw new Error(`Pago bloqueado por política de gobierno: ${verdict.reason}`);
  }

  let approvalId: string | undefined;
  if (verdict.requiresHumanApproval) {
    const approval = requestOrGetApproval({
      toolId,
      counterparty: requirement.payTo,
      amountUsd,
      network: requirement.network,
      reason: verdict.reason,
    });

    if (approval.status === "rejected") throw new ApprovalRejectedError(approval.id);
    if (approval.status === "pending") throw new ApprovalPendingError(approval.id, amountUsd);
    // status === "approved": autorizado por un humano, se consume abajo tras liquidar.
    approvalId = approval.id;
  }

  const account = loadAccount();
  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: requirement.network as `eip155:${string}`, client: new ExactEvmScheme(account) }],
    // Defensa en profundidad: el SDK de x402 trae su propio tope de gasto
    // ($1 por defecto), independiente de nuestra política. En vez de subirlo
    // de forma permanente, lo fijamos exactamente al monto que YA evaluó y
    // aprobó governance/policy.ts para esta llamada — nunca más que eso.
    spendControls: { maxAmountPerPayment: `$${amountUsd}` },
  });

  const paidResponse = await fetchWithPayment(url, init);

  // Solo se registra gasto si la liquidación realmente tuvo éxito. Un intento
  // de pago que vuelve a fallar en 402 (ej. saldo insuficiente) NO cuenta como
  // gasto — de lo contrario el ledger mentiría sobre lo que salió de la wallet.
  const settled = paidResponse.status !== 402;
  if (settled) {
    recordSpend({
      toolId,
      counterparty: requirement.payTo,
      amountUsd,
      network: requirement.network,
    });
    if (approvalId) consumeApproval(approvalId);
  }

  return { response: paidResponse, paid: settled, amountUsd: settled ? amountUsd : undefined };
}
