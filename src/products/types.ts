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
  handler: (req: Request, res: Response) => Promise<void> | void;
}
