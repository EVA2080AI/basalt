import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { createPublicClient, http, formatEther, formatUnits } from "viem";
import { baseSepolia, base } from "viem/chains";

/**
 * Identidad de Basalt. Vive fuera del repo (~/.automaton), nunca en git.
 *
 * Testnet y mainnet usan ARCHIVOS SEPARADOS a propósito — nunca el mismo
 * wallet.json reinterpretado según una variable de entorno. Así, fondear la
 * dirección equivocada por confundir de red es prácticamente imposible: cada
 * red tiene su propia clave, su propio archivo, su propia dirección.
 */

type NetworkId = "base-sepolia" | "base";

const HOME_DIR = path.join(homedir(), ".automaton");

function walletPath(network: NetworkId): string {
  return path.join(HOME_DIR, `wallet.${network}.json`);
}

interface StoredWallet {
  address: string;
  network: NetworkId;
  encrypted: boolean;
  iv?: string;
  authTag?: string;
  ciphertext?: string;
  privateKey?: string;
}

// Contratos oficiales de USDC (Circle) en cada red — usados solo para leer balance.
const USDC_ADDRESS: Record<NetworkId, `0x${string}`> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};
const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function ensureHomeDir(): void {
  if (!existsSync(HOME_DIR)) mkdirSync(HOME_DIR, { recursive: true, mode: 0o700 });
}

function deriveKey(passphrase: string): Buffer {
  return scryptSync(passphrase, "basalt-wallet-salt", 32);
}

function encryptPrivateKey(privateKey: string, passphrase: string) {
  const key = deriveKey(passphrase);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { iv: iv.toString("hex"), authTag: authTag.toString("hex"), ciphertext: ciphertext.toString("hex") };
}

function decryptPrivateKey(stored: StoredWallet, passphrase: string): string {
  const key = deriveKey(passphrase);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(stored.iv!, "hex"));
  decipher.setAuthTag(Buffer.from(stored.authTag!, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(stored.ciphertext!, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Cuál red usar por defecto cuando el llamador no especifica una explícitamente. */
export function defaultNetwork(): NetworkId {
  return process.env.AUTOMATON_ALLOW_MAINNET === "true" ? "base" : "base-sepolia";
}

/**
 * Modo hosting: en un contenedor en la nube el disco no es persistente entre
 * despliegues, así que la clave se inyecta como secreto de la plataforma en
 * vez de leerse de un archivo local. Cuando está presente, tiene prioridad
 * total y ninguna función de este módulo toca el filesystem.
 */
function envPrivateKey(): `0x${string}` | undefined {
  const raw = process.env.AUTOMATON_PRIVATE_KEY;
  if (!raw) return undefined;

  // Copiar y pegar un valor así en el panel de un hosting casi siempre trae
  // espacios, saltos de línea o comillas invisibles. Se normaliza en vez de
  // fallar con un error críptico de la librería de firma.
  let key = raw.trim();
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1).trim();
  if (!key.startsWith("0x")) key = `0x${key}`;

  const HEX_64 = /^0x[0-9a-fA-F]{64}$/;
  if (!HEX_64.test(key)) {
    throw new Error(
      `AUTOMATON_PRIVATE_KEY tiene un formato inválido (después de limpiar espacios/comillas quedó con ${key.length - 2} caracteres hex, se esperaban 64). ` +
        "Revisa que se haya copiado el valor completo de 'privateKey' del archivo de la wallet, sin texto adicional.",
    );
  }

  return key as `0x${string}`;
}

export function walletExists(network: NetworkId = defaultNetwork()): boolean {
  return envPrivateKey() !== undefined || existsSync(walletPath(network));
}

/**
 * Genera una wallet nueva si no existe para esa red. Idempotente.
 *
 * Regla dura: una wallet de MAINNET nunca se crea sin passphrase. Testnet sí
 * lo permite (con warning) porque ahí no hay dinero real en juego.
 */
export function initWallet(network: NetworkId = defaultNetwork()): { address: string; network: NetworkId; isNew: boolean } {
  const envKey = envPrivateKey();
  if (envKey) {
    return { address: privateKeyToAccount(envKey).address, network, isNew: false };
  }

  ensureHomeDir();
  const filePath = walletPath(network);

  if (existsSync(filePath)) {
    const stored: StoredWallet = JSON.parse(readFileSync(filePath, "utf8"));
    return { address: stored.address, network: stored.network, isNew: false };
  }

  const passphrase = process.env.AUTOMATON_WALLET_PASSPHRASE;

  if (network === "base" && !passphrase) {
    throw new Error(
      "Rechazado: no se crea una wallet de MAINNET sin AUTOMATON_WALLET_PASSPHRASE. " +
        "Una clave con dinero real nunca se guarda sin cifrar, sin excepción.",
    );
  }

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  let stored: StoredWallet;
  if (passphrase) {
    const enc = encryptPrivateKey(privateKey, passphrase);
    stored = { address: account.address, network, encrypted: true, ...enc };
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      `[basalt] AUTOMATON_WALLET_PASSPHRASE no está definida — la clave se guarda sin cifrar en ${filePath}. ` +
        "Aceptable solo en testnet.",
    );
    stored = { address: account.address, network, encrypted: false, privateKey };
  }

  writeFileSync(filePath, JSON.stringify(stored, null, 2));
  chmodSync(filePath, 0o600);
  return { address: account.address, network, isNew: true };
}

export function loadAccount(network: NetworkId = defaultNetwork()): PrivateKeyAccount {
  const envKey = envPrivateKey();
  if (envKey) return privateKeyToAccount(envKey);

  const filePath = walletPath(network);
  if (!existsSync(filePath)) {
    throw new Error(`No hay wallet de Basalt para '${network}' todavía. Ejecuta "npm run wallet:init" primero.`);
  }

  if (network === "base" && process.env.AUTOMATON_ALLOW_MAINNET !== "true") {
    throw new Error(
      "Se pidió cargar la wallet de mainnet pero AUTOMATON_ALLOW_MAINNET no está en 'true'. " +
        "Esto es intencional: evita mover fondos reales por accidente.",
    );
  }

  const stored: StoredWallet = JSON.parse(readFileSync(filePath, "utf8"));

  let privateKey: string;
  if (stored.encrypted) {
    const passphrase = process.env.AUTOMATON_WALLET_PASSPHRASE;
    if (!passphrase) throw new Error("La wallet está cifrada. Define AUTOMATON_WALLET_PASSPHRASE.");
    privateKey = decryptPrivateKey(stored, passphrase);
  } else {
    privateKey = stored.privateKey!;
  }

  return privateKeyToAccount(privateKey as `0x${string}`);
}

export async function getWalletInfo(network: NetworkId = defaultNetwork()) {
  const envKey = envPrivateKey();
  const filePath = walletPath(network);

  let stored: { address: string; network: NetworkId; encrypted: boolean };
  if (envKey) {
    stored = { address: privateKeyToAccount(envKey).address, network, encrypted: true };
  } else if (existsSync(filePath)) {
    const fromDisk: StoredWallet = JSON.parse(readFileSync(filePath, "utf8"));
    stored = { address: fromDisk.address, network: fromDisk.network, encrypted: fromDisk.encrypted };
  } else {
    return null;
  }

  const chain = stored.network === "base" ? base : baseSepolia;
  const client = createPublicClient({ chain, transport: http() });

  let ethBalance = "desconocido";
  try {
    const bal = await client.getBalance({ address: stored.address as `0x${string}` });
    ethBalance = `${formatEther(bal)} ETH`;
  } catch {
    // red no alcanzable en este momento — no es fatal para mostrar info local
  }

  let usdcBalance = "desconocido";
  try {
    const bal = await client.readContract({
      address: USDC_ADDRESS[stored.network],
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [stored.address as `0x${string}`],
    });
    usdcBalance = `${formatUnits(bal, 6)} USDC`;
  } catch {
    // red no alcanzable en este momento — no es fatal para mostrar info local
  }

  return {
    address: stored.address,
    network: stored.network,
    encrypted: stored.encrypted,
    ethBalance,
    usdcBalance,
    explorer:
      stored.network === "base"
        ? `https://basescan.org/address/${stored.address}`
        : `https://sepolia.basescan.org/address/${stored.address}`,
  };
}
