import "dotenv/config";
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { createResourceServer, buildRoute } from "../../payments/x402Server.js";
import { extractUrlMetadata } from "./extract.js";
import { initWallet } from "../../wallet/wallet.js";
import { DEFAULT_POLICY } from "../../governance/policy.js";

const PORT = Number(process.env.PORT ?? 4021);
const PRICE_USD = Number(process.env.AUTOMATON_URL_METADATA_PRICE_USD ?? 0.005);

async function main() {
  const wallet = initWallet();
  console.log(`[automaton] cobrando a nombre de ${wallet.address} en ${DEFAULT_POLICY.network}`);

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok", network: DEFAULT_POLICY.network }));

  const resourceServer = createResourceServer();
  const routes = buildRoute(
    "POST /extract",
    wallet.address,
    PRICE_USD,
    "Extrae título, descripción, imagen y texto limpio de una URL — pensado para que otros agentes lo consuman.",
  );

  app.use(paymentMiddleware(routes, resourceServer));

  app.post("/extract", async (req, res) => {
    const targetUrl = req.body?.url;
    if (typeof targetUrl !== "string") {
      res.status(400).json({ error: "Body debe incluir { url: string }" });
      return;
    }
    try {
      const metadata = await extractUrlMetadata(targetUrl);
      res.json(metadata);
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "Error desconocido" });
    }
  });

  app.listen(PORT, () => {
    console.log(`[automaton] url-metadata API escuchando en http://localhost:${PORT}`);
    console.log(`[automaton] POST /extract cuesta $${PRICE_USD} USDC (${DEFAULT_POLICY.network}), GET /health es gratis`);
  });
}

main();
