import { x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient, type RoutesConfig, type RouteConfig } from "@x402/core/server";
import { getDefaultAsset } from "@x402/evm";
import { facilitator as cdpFacilitatorConfig } from "@coinbase/x402";
import { declareDiscoveryExtension } from "@x402/extensions";
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
  id: string;
  method: "GET" | "POST";
  path: string;
  priceUsd: number;
  description: string;
  /** Forma del body esperado — usada como pista de schema para el bazaar de x402. */
  inputSchema?: Record<string, unknown>;
  /** Ejemplo real de body válido — el bazaar de x402 lo exige junto al schema. */
  inputExample?: Record<string, unknown>;
  /** Forma de la respuesta 200 — sin esto, x402scan marca cada ruta con SCHEMA_OUTPUT_MISSING. */
  outputSchema?: Record<string, unknown>;
  /** Ejemplo real de respuesta 200 — @x402/extensions descarta outputSchema si falta esto. */
  outputExample?: Record<string, unknown>;
}

/** La forma que `accepts` acepta en RoutesConfig — anclada al tipo del SDK. */
type AcceptsOption = NonNullable<RouteConfig["accepts"]>;

/**
 * Forma de CONFIG (PaymentOption): lo que consume @x402/express para montar
 * una ruta. Usa `price` en dólares legibles; el middleware lo convierte a
 * unidades atómicas al emitir el 402. El tipo de retorno es explícito a
 * propósito: sin él, un campo mal escrito (maxTimeoutSecs) compila igual y el
 * middleware cae en silencio al timeout por defecto.
 */
export function acceptsFor(p: ProductRoute, payToAddress: string): AcceptsOption {
  return {
    scheme: "exact",
    price: `$${p.priceUsd.toFixed(3)}`,
    network: DEFAULT_POLICY.network,
    payTo: payToAddress,
    maxTimeoutSeconds: 60,
  };
}

/**
 * Forma de WIRE (PaymentRequirements): exactamente lo que el 402 real devuelve
 * en el header `payment-required`, y por lo tanto la única que puede publicarse
 * bajo la clave `accepts` de un manifiesto.
 *
 * No es lo mismo que la forma de CONFIG de arriba: el validador oficial
 * (PaymentRequirementsV2Schema de @x402/core/schemas) exige `amount` en
 * unidades atómicas y `asset`, que la de config no tiene. Publicar la de config
 * ahí hace que cualquier consumidor que valide contra el esquema de x402
 * descarte el recurso.
 *
 * `asset`/`extra`/`decimals` se derivan de getDefaultAsset del SDK en vez de
 * hardcodearse: los valores cambian por red (en mainnet el nombre EIP-712 del
 * token es "USD Coin", en Base Sepolia es "USDC").
 */
export function paymentRequirementsFor(p: ProductRoute, payToAddress: string) {
  const asset = getDefaultAsset(DEFAULT_POLICY.network, "USDC");
  return {
    scheme: "exact" as const,
    network: DEFAULT_POLICY.network,
    amount: String(Math.round(p.priceUsd * 10 ** asset.decimals)),
    asset: asset.asset,
    payTo: payToAddress,
    maxTimeoutSeconds: 60,
    extra: { name: asset.name, version: asset.version },
  };
}

/**
 * Combina las rutas de todos los productos de Basalt en una sola
 * configuración x402. Incluye metadata de descubrimiento (extensions.bazaar)
 * para el directorio público de x402 — un agente comprador puede encontrar
 * Basalt ahí en vez de necesitar la URL de memoria. El indexado real requiere
 * un primer pago liquidado por un tercero (no autopago) — ver WALLETS.md.
 */
export function buildRoutes(products: ProductRoute[], payToAddress: string): RoutesConfig {
  const routes: RoutesConfig = {};
  for (const p of products) {
    routes[`${p.method} ${p.path}`] = {
      accepts: acceptsFor(p, payToAddress),
      description: p.description,
      serviceName: `Basalt: ${p.id}`,
      tags: ["basalt", "agent-tools", p.id],
      // Formato exacto exigido por @x402/extensions (confirmado en vivo: la
      // forma que se nos ocurrió primero salía "malformed" al arrancar).
      extensions:
        p.method === "GET"
          ? declareDiscoveryExtension({
              input: p.inputExample,
              inputSchema: p.inputSchema,
              output: p.outputExample ? { example: p.outputExample, schema: p.outputSchema } : undefined,
            })
          : declareDiscoveryExtension({
              bodyType: "json",
              input: p.inputExample,
              inputSchema: p.inputSchema,
              output: p.outputExample ? { example: p.outputExample, schema: p.outputSchema } : undefined,
            }),
    };
  }
  return routes;
}
