import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { loadAccount } from "../src/wallet/wallet.js";

/**
 * Script de un solo uso: da de alta a Basalt en x402-list.com pagando la
 * tarifa de $1 USDC que cobran a servicios en hosting gratuito (onrender.com).
 * Se corre a mano, una sola vez — no es parte del servidor ni de Basalt.
 *
 * Requiere en el entorno: AUTOMATON_ALLOW_MAINNET=true, AUTOMATON_WALLET_PASSPHRASE.
 */

const MAX_USD = "1.50"; // cubre el caso $1.00 (host gratuito) o $1.50 (+ reenvío)

const SUBMISSION = {
  url: "https://basalt-n6lt.onrender.com",
  email: "sebastian689@gmail.com",
  service_name: "Basalt",
  description:
    "Basalt vende 8 herramientas de utilidad a agentes de IA (extracción de metadata de URL, verificación de dominios vía RDAP, validación de email/MX, HTML a Markdown, generación de QR, extracción de texto de PDF, chequeo de certificados TLS, detección de idioma), cobrando por uso en USDC vía x402 sobre Base.",
  website_url: "https://basalt-n6lt.onrender.com",
  category: "AI",
  endpoints: ["/extract", "/domain-check", "/email-check", "/html-to-markdown", "/qrcode", "/pdf-extract", "/ssl-check", "/language-detect"],
  notes: "",
};

async function main() {
  const account = loadAccount("base");
  console.log(`[submit-x402-list] pagando desde ${account.address} (tope: $${MAX_USD} USDC)`);

  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(account) }],
    spendControls: { maxAmountPerPayment: `$${MAX_USD}` },
  });

  const res = await fetchWithPayment("https://x402-list.com/api/v1/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(SUBMISSION),
  });

  const json = await res.json().catch(() => null);
  console.log("Status:", res.status);
  console.log(JSON.stringify(json, null, 2));
}

main().catch((err) => {
  console.error("[submit-x402-list] ERROR:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
