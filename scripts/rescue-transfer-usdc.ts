import { createWalletClient, createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";
import { loadAccount } from "../src/wallet/wallet.js";

/**
 * Script de emergencia, un solo uso: saca TODO el USDC de la wallet de
 * mainnet de Basalt hacia una dirección de destino que TÚ confirmas cada vez
 * (nunca hardcodeada) — pensado para el caso de una clave privada expuesta,
 * donde hay que vaciar la wallet antes de que alguien más lo haga.
 *
 * Se corre a mano, tú, viendo la dirección de destino en el propio comando.
 * Requiere: AUTOMATON_ALLOW_MAINNET=true, AUTOMATON_PRIVATE_KEY, RESCUE_TO_ADDRESS.
 */

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const USDC_ABI = [
  { name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

async function main() {
  const to = process.env.RESCUE_TO_ADDRESS;
  if (!to || !/^0x[0-9a-fA-F]{40}$/.test(to)) {
    throw new Error("Define RESCUE_TO_ADDRESS con la dirección de destino completa (0x + 40 hex). No hay valor por defecto a propósito.");
  }

  const account = loadAccount("base");
  const publicClient = createPublicClient({ chain: base, transport: http() });
  const walletClient = createWalletClient({ account, chain: base, transport: http() });

  const ethBalance = await publicClient.getBalance({ address: account.address });
  console.log(`[rescue] wallet: ${account.address}`);
  console.log(`[rescue] ETH para gas: ${formatUnits(ethBalance, 18)}`);
  if (ethBalance === 0n) {
    throw new Error("La wallet no tiene ETH para pagar gas. Manda un poco de ETH en Base a esta dirección primero.");
  }

  const usdcBalance = await publicClient.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: "balanceOf", args: [account.address] });
  console.log(`[rescue] USDC disponible: ${formatUnits(usdcBalance, 6)}`);
  if (usdcBalance === 0n) {
    throw new Error("No hay USDC que mover.");
  }

  console.log(`[rescue] Enviando TODO (${formatUnits(usdcBalance, 6)} USDC) a ${to} ...`);
  const hash = await walletClient.writeContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: "transfer", args: [to as `0x${string}`, usdcBalance] });
  console.log(`[rescue] tx enviada: https://basescan.org/tx/${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[rescue] confirmada, status: ${receipt.status}`);
}

main().catch((err) => {
  console.error("[rescue] ERROR:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
