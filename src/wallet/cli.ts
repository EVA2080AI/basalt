import { initWallet, getWalletInfo } from "./wallet.js";

const cmd = process.argv[2];

async function main() {
  if (cmd === "init") {
    const { address, network, isNew } = initWallet();
    console.log(isNew ? "Wallet nueva creada." : "Wallet ya existía.");
    console.log(`  address: ${address}`);
    console.log(`  network: ${network}`);
    if (network === "base-sepolia") {
      console.log(`  Fondea esta dirección con USDC/ETH de testnet en https://faucet.circle.com y un faucet de Base Sepolia ETH.`);
    }
    return;
  }

  if (cmd === "info") {
    const info = await getWalletInfo();
    if (!info) {
      console.log("No hay wallet todavía. Ejecuta `npm run wallet:init`.");
      return;
    }
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  console.log("Uso: tsx src/wallet/cli.ts <init|info>");
}

main();
