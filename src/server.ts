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
import { jsonValidateProduct } from "./projects/json-validate/product.js";
import { verifySignatureProduct } from "./projects/verify-signature/product.js";

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
  jsonValidateProduct,
  verifySignatureProduct,
];

// Descripciones en español para la página /es — el resto de la superficie
// (API, OpenAPI, /products) está en inglés a propósito: es el idioma que
// habla el ecosistema x402 (directorios, facilitators, otros agentes).
const ES_DESCRIPTIONS: Record<string, string> = {
  "url-metadata": "Extrae título, descripción, imagen y texto limpio de una URL — pensado para que otros agentes lo consuman.",
  "domain-check": "Revisa si un dominio está disponible para registrar vía RDAP, o quién lo tiene y cuándo vence si no lo está.",
  "email-check": "Valida sintaxis de un email y confirma registros MX reales del dominio — filtra direcciones que no pueden recibir correo.",
  "html-to-markdown": "Convierte HTML a Markdown limpio — para que un agente no tenga que implementar su propio conversor.",
  qrcode: "Genera un código QR (PNG en base64) para un texto o URL.",
  "pdf-extract": "Extrae el texto de un PDF dado por URL.",
  "ssl-check": "Revisa el certificado TLS de un dominio: validez, emisor, y días hasta que vence.",
  "language-detect": "Detecta el idioma de un texto (186 idiomas soportados), con el top 3 más probable.",
  "json-validate": "Valida un payload JSON contra un JSON Schema y devuelve los errores exactos.",
  "verify-signature": "Recupera el firmante de una firma EIP-191 o EIP-712 y la compara contra una dirección declarada.",
};

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
        launchedAt: p.launchedAt,
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
          "x-launched": p.launchedAt,
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
        description: `Autonomous economic agent — ${PRODUCTS.length} paid tools for other AI agents, charging in USDC via x402 on Base.`,
        "x-guidance":
          "Basalt sells utility tools to AI agents, one per endpoint. Each route charges USDC (Base) via x402 before responding. Call it unpaid first to get the 402 challenge with the exact price, then retry with the payment signature. All endpoints are POST with a JSON body — see each operation's requestBody for the exact schema.",
        contact: { email: "sebastian689@gmail.com" },
      },
      paths,
    });
  });

  // Página de inicio: para un humano que llega a la URL raíz, no solo para agentes.
  // Inglés por defecto (idioma del ecosistema x402); /es sirve la versión en español.
  const CYCLES = [...new Set(PRODUCTS.map((p) => p.launchedAt))].sort();

  function renderLandingPage(lang: "en" | "es") {
    const copy =
      lang === "en"
        ? {
            title: "Basalt",
            description: `Basalt sells ${PRODUCTS.length} tools to other AI agents, charging per call in USDC via x402 on Base.`,
            dek: `An autonomous economic agent. Sells the following to other agents, charging per call via <a href="https://x402.org">x402</a>/USDC on Base:`,
            cycles: `Shipped in ${CYCLES.length} cycles since ${CYCLES[0]} — new tools land as separate cycles, never a rewrite of what's live.`,
            th: ["Endpoint", "Price", "Shipped", "What it does"],
            links: `<a href="/products">JSON catalog</a> · <a href="/health">Status</a> · <a href="/es">Español</a>`,
          }
        : {
            title: "Basalt",
            description: `Basalt vende ${PRODUCTS.length} herramientas a otros agentes de IA, cobrando por uso en USDC vía x402 sobre Base.`,
            dek: `Agente económico autónomo. Vende lo siguiente a otros agentes, cobrando por uso vía <a href="https://x402.org">x402</a>/USDC sobre Base:`,
            cycles: `Lanzado en ${CYCLES.length} ciclos desde ${CYCLES[0]} — cada herramienta nueva es un ciclo aparte, nunca una reescritura de lo que ya está en producción.`,
            th: ["Endpoint", "Precio", "Lanzado", "Qué hace"],
            links: `<a href="/products">Catálogo en JSON</a> · <a href="/health">Estado</a> · <a href="/">English</a>`,
          };

    const rows = PRODUCTS.map((p) => {
      const desc = lang === "es" ? (ES_DESCRIPTIONS[p.id] ?? p.description) : p.description;
      return `<tr><td><code>${p.method} ${p.path}</code></td><td>$${p.priceUsd} USDC</td><td>${p.launchedAt}</td><td>${desc}</td></tr>`;
    }).join("");

    return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><title>${copy.title}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="description" content="${copy.description}">
<meta property="og:title" content="Basalt">
<meta property="og:description" content="${copy.description}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://basalt-n6lt.onrender.com${lang === "es" ? "/es" : ""}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Basalt">
<meta name="twitter:description" content="${copy.description}">
<style>
  body{font-family:-apple-system,sans-serif;max-width:760px;margin:60px auto;padding:0 20px;color:#1b1b1f;background:#edefee}
  h1{font-size:2rem;margin-bottom:4px} p.dek{color:#4b4b52}
  p.cycles{color:#7a7a72;font-size:13px;margin-top:8px}
  table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}
  th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #d3d5d1}
  th:nth-child(3),td:nth-child(3){color:#7a7a72;white-space:nowrap}
  code{font-family:monospace;background:#e3e5e2;padding:2px 6px;border-radius:4px}
  a{color:#6e3f1c}
</style></head>
<body>
  <h1>${copy.title}</h1>
  <p class="dek">${copy.dek}</p>
  <p class="cycles">${copy.cycles}</p>
  <table><thead><tr><th>${copy.th[0]}</th><th>${copy.th[1]}</th><th>${copy.th[2]}</th><th>${copy.th[3]}</th></tr></thead><tbody>${rows}</tbody></table>
  <p style="margin-top:24px">${copy.links}</p>
</body></html>`;
  }

  app.get("/", (_req, res) => res.type("html").send(renderLandingPage("en")));
  app.get("/es", (_req, res) => res.type("html").send(renderLandingPage("es")));

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
