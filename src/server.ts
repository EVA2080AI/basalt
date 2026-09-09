import "dotenv/config";
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { createResourceServer, buildRoutes } from "./payments/x402Server.js";
import { initWallet } from "./wallet/wallet.js";
import { DEFAULT_POLICY } from "./governance/policy.js";
import type { Product } from "./products/types.js";
import { urlMetadataProduct } from "./projects/url-metadata/product.js";
import { domainCheckProduct } from "./projects/domain-check/product.js";
import { emailCheckProduct } from "./projects/email-check/product.js";
import { htmlToMarkdownProduct } from "./projects/html-to-markdown/product.js";
import { qrcodeProduct } from "./projects/qrcode/product.js";

/**
 * Un solo servidor para todos los productos de Basalt. Agregar el producto
 * #21 es agregar una entrada a esta lista — no un puerto ni un proceso nuevo.
 */
const PRODUCTS: Product[] = [urlMetadataProduct, domainCheckProduct, emailCheckProduct, htmlToMarkdownProduct, qrcodeProduct];

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

  // Página de inicio: para un humano que llega a la URL raíz, no solo para agentes.
  app.get("/", (_req, res) => {
    const rows = PRODUCTS.map(
      (p) => `<tr><td><code>${p.method} ${p.path}</code></td><td>$${p.priceUsd} USDC</td><td>${p.description}</td></tr>`,
    ).join("");
    res.type("html").send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Basalt</title>
<style>
  body{font-family:-apple-system,sans-serif;max-width:720px;margin:60px auto;padding:0 20px;color:#1b1b1f;background:#edefee}
  h1{font-size:2rem;margin-bottom:4px} p.dek{color:#4b4b52}
  table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}
  th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #d3d5d1}
  code{font-family:monospace;background:#e3e5e2;padding:2px 6px;border-radius:4px}
  a{color:#6e3f1c}
</style></head>
<body>
  <h1>Basalt</h1>
  <p class="dek">Agente económico autónomo. Vende lo siguiente a otros agentes, cobrando por uso vía <a href="https://x402.org">x402</a>/USDC sobre Base:</p>
  <table><thead><tr><th>Endpoint</th><th>Precio</th><th>Qué hace</th></tr></thead><tbody>${rows}</tbody></table>
  <p style="margin-top:24px"><a href="/products">Catálogo en JSON</a> · <a href="/health">Estado</a></p>
</body></html>`);
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
