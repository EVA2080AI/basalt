import type { Request, Response } from "express";

/**
 * Contrato que cada producto de Basalt implementa. Agregar un producto #21
 * es agregar un archivo que exporte uno de estos — nunca un servidor nuevo.
 */
export interface Product {
  id: string;
  method: "GET" | "POST";
  path: string;
  priceUsd: number;
  description: string;
  /** Forma del body esperado — se publica como pista de schema para el bazaar de x402. */
  inputSchema?: Record<string, unknown>;
  /** Ejemplo real de body válido — el bazaar de x402 lo exige junto al schema. */
  inputExample?: Record<string, unknown>;
  /** Forma de la respuesta 200 — se publica en /openapi.json para x402scan. */
  outputSchema?: Record<string, unknown>;
  /** Ejemplo real de respuesta 200 — sin esto, el bazaar de x402 descarta outputSchema entero. */
  outputExample?: Record<string, unknown>;
  /** Fecha (YYYY-MM-DD) en que el producto salió a producción — traza en qué ciclo nació cada uno. */
  launchedAt: string;
  handler: (req: Request, res: Response) => Promise<void> | void;
}
