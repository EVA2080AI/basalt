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
import { pdfExtractProduct } from "./projects/pdf-extract/product.js";
import { sslCheckProduct } from "./projects/ssl-check/product.js";
import { languageDetectProduct } from "./projects/language-detect/product.js";

/**
 * Un solo servidor para todos los productos de Basalt. Agregar el producto
 * #21 es agregar una entrada a esta lista — no un puerto ni un proceso nuevo.
 */
const PRODUCTS: Product[] = [
  urlMetadataProduct,
  domainCheckProduct,
  emailCheckProduct,
  htmlToMarkdownProduct,
  qrcodeProduct,
  pdfExtractProduct,
  sslCheckProduct,
  languageDetectProduct,
];

const PORT = Number(process.env.PORT ?? 4021);

async function main() {
  const wallet = initWallet();
  console.log(`[basalt] cobrando a nombre de ${wallet.address} en ${DEFAULT_POLICY.network}`);

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok", network: DEFAULT_POLICY.network }));

  // Favicon: sin esto, el auditor de x402scan marca FAVICON_MISSING en cada ruta.
  app.get("/favicon.svg", (_req, res) => {
    res.type("image/svg+xml").send(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
        `<rect width="64" height="64" rx="14" fill="#2b2a28"/>` +
        `<text x="32" y="44" font-family="system-ui,-apple-system,sans-serif" font-size="34" font-weight="700" fill="#e3e5e2" text-anchor="middle">B</text>` +
        `</svg>`,
    );
  });

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

  // Manifiesto de descubrimiento (borrador de estándar de la x402 Foundation,
  // draft-hawkins-x402-dns-discovery — no obligatorio hoy, pero barato de
  // publicar y deja a Basalt listo si se vuelve estándar).
  app.get("/.well-known/x402.json", (_req, res) => {
    res.json({
      x402Version: 2,
      kind: "seller",
      facilitator: "https://api.cdp.coinbase.com",
      resources: PRODUCTS.map((p) => ({
        resource: `${p.method} ${p.path}`,
        description: p.description,
        network: DEFAULT_POLICY.network,
        payTo: wallet.address,
      })),
    });
  });

  // OpenAPI: formato canónico de descubrimiento que exige x402scan
  // (docs.x402scan.com/discovery/spec) — sin esto, "No discovery document
  // found" al intentar registrar, confirmado en vivo contra su formulario.
  app.get("/openapi.json", (_req, res) => {
    const paths: Record<string, Record<string, unknown>> = {};
    for (const p of PRODUCTS) {
      paths[p.path] = {
        [p.method.toLowerCase()]: {
          operationId: p.id,
          summary: `Basalt — ${p.id}`,
          description: p.description,
          tags: ["basalt"],
          "x-payment-info": {
            price: { mode: "fixed", currency: "USD", amount: p.priceUsd.toFixed(6) },
            protocols: [{ x402: {} }],
          },
          ...(p.method === "POST"
            ? {
                requestBody: {
                  required: true,
                  content: { "application/json": { schema: p.inputSchema ?? { type: "object" }, example: p.inputExample } },
                },
              }
            : {}),
          responses: {
            "200": {
              description: "Successful response",
              content: { "application/json": { schema: p.outputSchema ?? { type: "object" } } },
            },
            "402": { description: "Payment Required" },
          },
        },
      };
    }
    res.json({
      openapi: "3.1.0",
      info: {
        title: "Basalt",
        version: "0.1.0",
        description: `Agente económico autónomo — ${PRODUCTS.length} herramientas pagas para otros agentes de IA, cobrando en USDC vía x402 sobre Base.`,
        "x-guidance":
          "Basalt vende herramientas de utilidad a agentes de IA, una por endpoint. Cada ruta cobra en USDC (Base) vía x402 antes de responder. Llama primero sin pago para recibir el challenge 402 con el precio exacto; luego reintenta con la firma de pago. Todos los endpoints son POST con body JSON, ver requestBody de cada operación para el schema exacto.",
        contact: { email: "sebastian689@gmail.com" },
      },
      paths,
    });
  });

  // Página de inicio: para un humano que llega a la URL raíz, no solo para agentes.
  app.get("/", (_req, res) => {
    const rows = PRODUCTS.map(
      (p) => `<tr><td><code>${p.method} ${p.path}</code></td><td>$${p.priceUsd} USDC</td><td>${p.description}</td></tr>`,
    ).join("");
    const description = `Basalt vende ${PRODUCTS.length} herramientas a otros agentes de IA, cobrando por uso en USDC vía x402 sobre Base.`;
    res.type("html").send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Basalt</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="description" content="${description}">
<meta property="og:title" content="Basalt">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://basalt-n6lt.onrender.com">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Basalt">
<meta name="twitter:description" content="${description}">
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
