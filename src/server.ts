import "dotenv/config";
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { createResourceServer, buildRoutes } from "./payments/x402Server.js";
import { initWallet } from "./wallet/wallet.js";
import { DEFAULT_POLICY } from "./governance/policy.js";
import type { Product } from "./products/types.js";
import { urlMetadataProduct } from "./projects/url-metadata/product.js";
import { domainCheckProduct } from "./projects/domain-check/product.js";

/**
 * Un solo servidor para todos los productos de Basalt. Agregar el producto
 * #21 es agregar una entrada a esta lista — no un puerto ni un proceso nuevo.
 */
const PRODUCTS: Product[] = [urlMetadataProduct, domainCheckProduct];

const PORT = Number(process.env.PORT ?? 4021);

async function main() {
  const wallet = initWallet();
  console.log(`[basalt] cobrando a nombre de ${wallet.address} en ${DEFAULT_POLICY.network}`);

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok", network: DEFAULT_POLICY.network }));

  // Catálogo público y gratuito: cómo otros agentes descubren qué vende Basalt.
  app.get("/products", (_req, res) => {
    res.json(
      PRODUCTS.map((p) => ({
        id: p.id,
        method: p.method,
        path: p.path,
        priceUsd: p.priceUsd,
        description: p.description,
      })),
    );
  });

  const resourceServer = createResourceServer();
  const routes = buildRoutes(PRODUCTS, wallet.address);
  app.use(paymentMiddleware(routes, resourceServer));

  for (const product of PRODUCTS) {
    const method = product.method.toLowerCase() as "get" | "post";
    app[method](product.path, product.handler);
  }

  app.listen(PORT, () => {
    console.log(`[basalt] escuchando en http://localhost:${PORT}`);
    console.log(`[basalt] catálogo: GET /products (gratis)`);
    for (const p of PRODUCTS) {
      console.log(`[basalt]   ${p.method} ${p.path} — $${p.priceUsd} USDC — ${p.description}`);
    }
  });
}

main();
