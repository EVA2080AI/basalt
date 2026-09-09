import { x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient, type RoutesConfig } from "@x402/core/server";
import { facilitator as cdpFacilitatorConfig } from "@coinbase/x402";
import { DEFAULT_POLICY } from "../governance/policy.js";

const FACILITATOR_URL = process.env.AUTOMATON_FACILITATOR_URL ?? "https://x402.org/facilitator";

function hasCdpCredentials(): boolean {
  return Boolean(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET);
}

/**
 * Servidor de recursos x402: cómo Basalt cobra por lo que construye.
 *
 * El facilitator público (x402.org) solo soporta Base Sepolia — confirmado
 * en producción con un RouteConfigurationError real al intentar mainnet.
 * Con credenciales de CDP configuradas, se usa el facilitator oficial de
 * Coinbase (soporta Base mainnet); si no, se sigue usando el público, válido
 * para testnet.
 */
export function createResourceServer() {
  if (DEFAULT_POLICY.network === "eip155:8453" && !hasCdpCredentials()) {
    throw new Error(
      "AUTOMATON_ALLOW_MAINNET está en 'true' pero no hay credenciales de CDP " +
        "(CDP_API_KEY_ID / CDP_API_KEY_SECRET). El facilitator público de x402.org " +
        "no soporta Base mainnet — se necesita el facilitator de Coinbase Developer Platform.",
    );
  }

  const facilitator = hasCdpCredentials() ? new HTTPFacilitatorClient(cdpFacilitatorConfig) : new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  return new x402ResourceServer(facilitator).register(DEFAULT_POLICY.network, new ExactEvmScheme());
}

export interface ProductRoute {
  method: "GET" | "POST";
  path: string;
  priceUsd: number;
  description: string;
}

/** Combina las rutas de todos los productos de Basalt en una sola configuración x402. */
export function buildRoutes(products: ProductRoute[], payToAddress: string): RoutesConfig {
  const routes: RoutesConfig = {};
  for (const p of products) {
    routes[`${p.method} ${p.path}`] = {
      accepts: {
        scheme: "exact",
        price: `$${p.priceUsd.toFixed(3)}`,
        network: DEFAULT_POLICY.network,
        payTo: payToAddress,
        maxTimeoutSeconds: 60,
      },
      description: p.description,
    };
  }
  return routes;
}
