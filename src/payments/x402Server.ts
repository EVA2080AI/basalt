import { x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient, type RoutesConfig } from "@x402/core/server";
import { DEFAULT_POLICY } from "../governance/policy.js";

const FACILITATOR_URL = process.env.AUTOMATON_FACILITATOR_URL ?? "https://x402.org/facilitator";

/** Servidor de recursos x402: cómo Automaton cobra por lo que construye. */
export function createResourceServer() {
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
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
