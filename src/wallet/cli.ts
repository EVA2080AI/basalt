import { initWallet, getWalletInfo, defaultNetwork } from "./wallet.js";

const cmd = process.argv[2];
// --mainnet fuerza operar sobre la wallet de Base mainnet en vez de la de testnet
// por defecto. Requiere además AUTOMATON_ALLOW_MAINNET=true para tener efecto.
const network = process.argv.includes("--mainnet") ? "base" : defaultNetwork();

async function main() {
  if (cmd === "init") {
    const { address, network: net, isNew } = initWallet(network);
    console.log(isNew ? "Wallet nueva creada." : "Wallet ya existía.");
    console.log(`  address: ${address}`);
    console.log(`  network: ${net}`);
    if (net === "base-sepolia") {
      console.log(`  Fondea esta dirección con USDC/ETH de testnet en https://faucet.circle.com y un faucet de Base Sepolia ETH.`);
    } else {
      console.log(`  ⚠️  Esta es una wallet de MAINNET. Cualquier fondo que reciba es dinero real.`);
    }
    return;
  }

  if (cmd === "info") {
    const info = await getWalletInfo(network);
    if (!info) {
      console.log(`No hay wallet para '${network}' todavía. Ejecuta \`npm run wallet:init\`.`);
      return;
    }
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  console.log("Uso: tsx src/wallet/cli.ts <init|info> [--mainnet]");
}

main();
