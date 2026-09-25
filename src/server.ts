import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { createResourceServer, buildRoutes, paymentRequirementsFor } from "./payments/x402Server.js";
import { initWallet } from "./wallet/wallet.js";
import { DEFAULT_POLICY } from "./governance/policy.js";
import { PRODUCTS } from "./products/catalog.js";
import { loadSnapshot, refresh as refreshPeers, revalidateKnown, registrySummary } from "./discovery/registry.js";
import { introspect } from "./discovery/introspect.js";

/**
 * Un solo servidor para todos los productos de Basalt. Agregar el producto
 * #21 es agregar una entrada a esta lista — no un puerto ni un proceso nuevo.
 */

// Descripciones en español para la página /es — el resto de la superficie
// (API, OpenAPI, /products) está en inglés a propósito: es el idioma que
// habla el ecosistema x402 (directorios, facilitators, otros agentes).

const PORT = Number(process.env.PORT ?? 4021);

async function main() {
  const wallet = initWallet();
  console.log(`[basalt] cobrando a nombre de ${wallet.address} en ${DEFAULT_POLICY.network}`);

  const app = express();
  app.use(express.json());

  // CORS solo en la superficie pública de lectura. Son endpoints gratis y
  // públicos: sin esto, un dashboard en el navegador o un agente corriendo en
  // una página no puede leerlos. Las rutas pagas (POST) no se tocan — el
  // desafío 402 queda exactamente como lo verifican los directorios.
  const PUBLIC_READ = [
    "/health", "/stats", "/pulse", "/uptime", "/introspect", "/products",
    "/openapi.json", "/llms.txt", "/.well-known/x402.json",
  ];
  app.get(PUBLIC_READ, (_req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Expose-Headers", "Content-Type");
    next();
  });

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

  // Sin restricciones: Basalt existe para que crawlers y agentes lo encuentren.
  app.get("/robots.txt", (_req, res) => res.type("text/plain").send("User-agent: *\nAllow: /\n"));

  // llms.txt (llmstxt.org): convención que agentes basados en LLM leen directo
  // para entender un sitio sin tener que parsear HTML — barato de mantener
  // porque se genera del mismo PRODUCTS que todo lo demás.
  app.get("/llms.txt", (_req, res) => {
    const toolLines = PRODUCTS.map((p) => `- ${p.method} ${p.path} ($${p.priceUsd}): ${p.description}`).join("\n");
    res.type("text/plain").send(
      `# Basalt\n\n` +
        `> Autonomous economic agent selling ${PRODUCTS.length} pay-per-call utility tools to other AI agents, charging USDC via x402 on Base.\n\n` +
        `Basalt is a resource server, not a marketing site: call any endpoint below unpaid first to receive an HTTP 402 challenge with the exact price, then retry with a valid x402 payment signature. All endpoints are POST with a JSON body.\n\n` +
        `## Discovery\n\n` +
        `- [OpenAPI](/openapi.json): canonical machine-readable contract — full request/response schemas and examples for every endpoint.\n` +
        `- [x402 manifest](/.well-known/x402.json): x402 Foundation discovery draft format.\n` +
        `- [Catalog](/products): free JSON list of tools, prices, and launch dates.\n\n` +
        `## Tools\n\n${toolLines}\n\n` +
        `## Contact\n\n- Email: sebastian689@gmail.com\n`,
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
        // `resource` se mantiene tal cual porque es el campo contra el que
        // gold-402 y x402scan ya verificaron a Basalt. `method`/`path` van
        // aparte: los indexadores que tratan `resource` como path publicaban
        // engendros tipo "GET https://basalt.../POST /extract" (visto en vivo
        // en el listado de Cleared Index, 2026-09-23).
        resource: `${p.method} ${p.path}`,
        method: p.method,
        path: p.path,
        description: p.description,
        network: DEFAULT_POLICY.network,
        payTo: wallet.address,
        // Sin precio en el manifiesto, un indexador honesto publica "price
        // unknown — confirm before pay", justo antes del pago. `priceUsd` es el
        // número legible; `accepts` lleva los PaymentRequirements con la forma
        // de wire del 402 real (amount atómico + asset), la única que pasa
        // PaymentRequirementsV2Schema. El 402 sigue siendo la fuente de verdad:
        // esto es descubrimiento, no un atajo para saltear el desafío de pago.
        priceUsd: p.priceUsd,
        accepts: [paymentRequirementsFor(p, wallet.address)],
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
            links: `<a href="/products">JSON catalog</a> · <a href="/llms.txt">llms.txt</a> · <a href="/stats">Live stats</a> · <a href="/pulse">Pulse</a> · <a href="/uptime">Uptime</a> · <a href="/health">Status</a> · <a href="/es">Español</a>`,
          }
        : {
            title: "Basalt",
            description: `Basalt vende ${PRODUCTS.length} herramientas a otros agentes de IA, cobrando por uso en USDC vía x402 sobre Base.`,
            dek: `Agente económico autónomo. Vende lo siguiente a otros agentes, cobrando por uso vía <a href="https://x402.org">x402</a>/USDC sobre Base:`,
            cycles: `Lanzado en ${CYCLES.length} ciclos desde ${CYCLES[0]} — cada herramienta nueva es un ciclo aparte, nunca una reescritura de lo que ya está en producción.`,
            th: ["Endpoint", "Precio", "Lanzado", "Qué hace"],
            links: `<a href="/products">Catálogo en JSON</a> · <a href="/llms.txt">llms.txt</a> · <a href="/stats">Estadísticas en vivo</a> · <a href="/pulse">Pulso</a> · <a href="/uptime">Uptime</a> · <a href="/health">Estado</a> · <a href="/">English</a>`,
          };

    const rows = PRODUCTS.map((p) => {
      const desc = lang === "es" ? (p.descriptionEs ?? p.description) : p.description;
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

  // Basalt operaba a ciegas: cero visibilidad de si algo real está tocando
  // los endpoints. Este contador es la primera pieza de eso — en memoria
  // (se reinicia en cada redeploy, por diseño: no guarda IPs ni bodies, solo
  // cuenta). "probes" = cualquier intento (pagado o no); "paid" = liquidado.
  const stats = new Map<string, { probes: number; paid: number }>();
  for (const p of PRODUCTS) stats.set(p.id, { probes: 0, paid: 0 });
  const startedAt = new Date().toISOString();

  app.use((req, _res, next) => {
    const product = PRODUCTS.find((p) => p.path === req.path && p.method === req.method);
    if (product) stats.get(product.id)!.probes++;
    next();
  });

  // Lógica de evolución: convierte los números crudos en una clasificación
  // accionable. No es solo "cuánto tráfico" — es "qué hacer con esto":
  //   no_traffic      → nadie ha tocado esta ruta desde el último deploy.
  //   probed_not_paid → alguien la llama pero nunca liquida — la señal más
  //                     valiosa de las tres: algo entre el descubrimiento y
  //                     el pago está fallando (precio, claridad, ejemplo).
  //   converting      → al menos un pago real liquidado.
  function classify(t: { probes: number; paid: number }): "no_traffic" | "probed_not_paid" | "converting" {
    if (t.paid > 0) return "converting";
    if (t.probes > 0) return "probed_not_paid";
    return "no_traffic";
  }

  function toolStats() {
    const tools = PRODUCTS.map((p) => {
      const t = stats.get(p.id)!;
      return { id: p.id, path: p.path, probes: t.probes, paid: t.paid, status: classify(t) };
    });
    const summary = {
      no_traffic: tools.filter((t) => t.status === "no_traffic").length,
      probed_not_paid: tools.filter((t) => t.status === "probed_not_paid").length,
      converting: tools.filter((t) => t.status === "converting").length,
    };
    return { tools, summary };
  }

  app.get("/stats", (_req, res) => {
    res.json({
      since: startedAt,
      note: "En memoria — se reinicia en cada redeploy. 'probes' cuenta cualquier intento (pagado o no); 'paid' solo llamadas liquidadas. 'status' es la lógica de evolución: probed_not_paid es la señal más útil para decidir qué mejorar.",
      ...toolStats(),
    });
  });

  // Pulso propio: todo lo "autónomo" construido hasta ahora (ciclos de
  // producto, monitores) vivía en una sesión externa de Claude Code — si esa
  // sesión no está corriendo, nada evoluciona, aunque el servidor siga en
  // pie. Esto es distinto: corre DENTRO del proceso que Render mantiene
  // vivo, sin depender de que nadie lo esté supervisando por fuera. No
  // toma ninguna acción (nunca gasta, nunca se auto-modifica) — es
  // autoconciencia, no autonomía financiera. Late cada 15 min mientras el
  // proceso esté arriba; console.log queda en los logs de Render.
  let heartbeats = 0;
  const HEARTBEAT_MS = 15 * 60 * 1000;

  // El índice de pares arranca del snapshot commiteado: una request pagada
  // nunca espera a un tercero.
  loadSnapshot();
  console.log(`[basalt] índice de pares cargado — ${JSON.stringify(registrySummary())}`);

  // Rastreo hacia afuera. Esto es lo único "autónomo" que toma iniciativa
  // propia, y es deliberadamente solo lectura: descubre, nunca paga ni firma
  // (el límite duro 1 no se toca desde acá). Cada 6h, contado en pulsos para
  // no montar un segundo temporizador.
  const CRAWL_EVERY_HEARTBEATS = 24; // 24 * 15min = 6h

  // El plan de Render es `free`: duerme el servicio tras ~15 min sin tráfico y
  // lo revive en la siguiente request. Medido en vivo el 2026-09-25: el proceso
  // llevaba 8 latidos y `lastRefresh` seguía en null — el rastreo de 6h NUNCA
  // se disparó, porque el proceso no vive 6 horas seguidas.
  //
  // Por eso hay dos ritmos distintos:
  //   - Al arrancar (90s después, para no ensuciar el cold start): revalidar
  //     solo los vendedores ya conocidos. Son ~40 requests, termina en
  //     segundos, y detecta los que se murieron. Esto sí corre en cada
  //     despertar del proceso.
  //   - Cada 6h, si el proceso llega a vivir tanto: el rastreo completo de las
  //     ~310 semillas, que es el que descubre vendedores nuevos.
  //
  // El rastreo completo no se hace en cada arranque a propósito: son ~600
  // requests salientes a terceros, y dispararlas cada vez que Render despierta
  // el proceso sería abusar de pares que no nos deben nada.
  setTimeout(() => {
    console.log("[basalt] revalidando vendedores conocidos (solo lectura)…");
    void revalidateKnown(new Date().toISOString()).then((r) => {
      console.log(`[basalt] revalidación lista — ${JSON.stringify(r)}`);
    });
  }, 90_000).unref();

  setInterval(() => {
    heartbeats++;
    console.log(`[basalt] pulso #${heartbeats} — ${JSON.stringify(toolStats().summary)}`);

    if (heartbeats % CRAWL_EVERY_HEARTBEATS === 0) {
      const startedAtCrawl = new Date().toISOString();
      console.log(`[basalt] rastreando el ecosistema x402 completo (solo lectura)…`);
      void refreshPeers(startedAtCrawl).then(() => {
        console.log(`[basalt] índice de pares actualizado — ${JSON.stringify(registrySummary())}`);
      });
    }
  }, HEARTBEAT_MS).unref();

  // Autodiagnóstico por reglas. Gratis y público, como el resto de la
  // telemetría: es el insumo del paso 2 de OPERATING.md, así que una sesión
  // nueva no tiene que recalcularlo a mano.
  app.get("/introspect", (_req, res) => {
    const { tools } = toolStats();
    res.json(
      introspect({
        now: new Date(),
        bornAt: startedAt,
        uptimeSeconds: Math.floor(process.uptime()),
        heartbeats,
        tools,
        catalog: PRODUCTS.map((p) => ({ id: p.id, path: p.path, priceUsd: p.priceUsd })),
        manifestResourceCount: PRODUCTS.length,
      }),
    );
  });

  app.get("/pulse", (_req, res) => {
    const { summary } = toolStats();
    const uptimeSeconds = Math.floor(process.uptime());
    res.json({
      alive: true,
      bornAt: startedAt,
      uptimeSeconds,
      heartbeats,
      address: wallet.address,
      network: DEFAULT_POLICY.network,
      toolCount: PRODUCTS.length,
      peerIndex: registrySummary(),
      summary,
      selfReport:
        `He estado vivo ${uptimeSeconds}s desde mi último despliegue (nace de nuevo con cada uno — no es memoria falsa). ` +
        `Vendo ${PRODUCTS.length} herramientas: ${summary.converting} han recibido al menos un pago real, ` +
        `${summary.probed_not_paid} me han llamado sin pagar, ${summary.no_traffic} nadie las ha tocado todavía.`,
    });
  });

  // Historial de confiabilidad verificable: no vive en memoria (se perdería
  // en cada redeploy) — vive en el propio repo como un archivo de solo
  // append, uptime-log.jsonl. Cada línea es un chequeo real end-to-end de
  // las 14 rutas contra producción. Se actualiza con cada commit que agrega
  // una entrada nueva, no en tiempo real — es honesto sobre esa cadencia en
  // vez de aparentar un monitor live que esta arquitectura no puede sostener
  // sin una base de datos (infraestructura nueva, fuera de alcance).
  app.get("/uptime", (_req, res) => {
    let entries: { ts: string; checked: number; broken: string[] }[] = [];
    try {
      const raw = readFileSync(path.join(process.cwd(), "uptime-log.jsonl"), "utf8");
      entries = raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
    } catch {
      entries = [];
    }
    const healthy = entries.filter((e) => e.broken.length === 0).length;
    const uptimePercent = entries.length > 0 ? Math.round((healthy / entries.length) * 10000) / 100 : null;
    const lastIncident = [...entries].reverse().find((e) => e.broken.length > 0) ?? null;
    res.json({
      note: "Cada línea es un chequeo real, end-to-end, contra producción. Se actualiza por commit, no en vivo — ver 'checks' para las marcas de tiempo reales.",
      uptimePercent,
      totalChecks: entries.length,
      lastIncident,
      checks: entries.slice(-50),
    });
  });

  const resourceServer = createResourceServer();
  const routes = buildRoutes(PRODUCTS, wallet.address);
  app.use(paymentMiddleware(routes, resourceServer));

  for (const product of PRODUCTS) {
    const method = product.method.toLowerCase() as "get" | "post";
    app[method](product.path, (req: express.Request, res: express.Response) => {
      stats.get(product.id)!.paid++;
      return product.handler(req, res);
    });
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
