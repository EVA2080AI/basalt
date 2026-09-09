import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { createPublicClient, http, formatEther } from "viem";
import { baseSepolia, base } from "viem/chains";

/**
 * Identidad de Automaton. Vive fuera del repo (~/.automaton), nunca en git.
 * Testnet (Base Sepolia) por defecto; mainnet solo con AUTOMATON_ALLOW_MAINNET=true.
 */

const HOME_DIR = path.join(homedir(), ".automaton");
const WALLET_PATH = path.join(HOME_DIR, "wallet.json");

interface StoredWallet {
  address: string;
  network: "base-sepolia" | "base";
  encrypted: boolean;
  // Si encrypted=true: iv + authTag + ciphertext (AES-256-GCM sobre la private key).
  // Si encrypted=false: privateKey en claro (solo prototipo, con warning explícito).
  iv?: string;
  authTag?: string;
  ciphertext?: string;
  privateKey?: string;
}

function ensureHomeDir(): void {
  if (!existsSync(HOME_DIR)) mkdirSync(HOME_DIR, { recursive: true, mode: 0o700 });
}

function deriveKey(passphrase: string): Buffer {
  return scryptSync(passphrase, "automaton-wallet-salt", 32);
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

function isMainnetAllowed(): boolean {
  return process.env.AUTOMATON_ALLOW_MAINNET === "true";
}

export function walletExists(): boolean {
  return existsSync(WALLET_PATH);
}

/** Genera una wallet nueva si no existe. Idempotente. */
export function initWallet(): { address: string; network: string; isNew: boolean } {
  ensureHomeDir();
  if (walletExists()) {
    const stored: StoredWallet = JSON.parse(readFileSync(WALLET_PATH, "utf8"));
    return { address: stored.address, network: stored.network, isNew: false };
  }

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const passphrase = process.env.AUTOMATON_WALLET_PASSPHRASE;
  const network: StoredWallet["network"] = isMainnetAllowed() ? "base" : "base-sepolia";

  let stored: StoredWallet;
  if (passphrase) {
    const enc = encryptPrivateKey(privateKey, passphrase);
    stored = { address: account.address, network, encrypted: true, ...enc };
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      "[automaton] AUTOMATON_WALLET_PASSPHRASE no está definida — la clave se guarda sin cifrar en " +
        WALLET_PATH +
        ". Recomendado solo para pruebas en testnet.",
    );
    stored = { address: account.address, network, encrypted: false, privateKey };
  }

  writeFileSync(WALLET_PATH, JSON.stringify(stored, null, 2));
  chmodSync(WALLET_PATH, 0o600);
  return { address: account.address, network, isNew: true };
}

export function loadAccount(): PrivateKeyAccount {
  if (!walletExists()) {
    throw new Error("No hay wallet de Automaton todavía. Ejecuta `npm run wallet:init` primero.");
  }
  const stored: StoredWallet = JSON.parse(readFileSync(WALLET_PATH, "utf8"));

  if (stored.network === "base" && !isMainnetAllowed()) {
    throw new Error(
      "Esta wallet está configurada para Base mainnet pero AUTOMATON_ALLOW_MAINNET no está en 'true'. " +
        "Esto es intencional: evita mover fondos reales por accidente.",
    );
  }

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

export async function getWalletInfo() {
  if (!walletExists()) return null;
  const stored: StoredWallet = JSON.parse(readFileSync(WALLET_PATH, "utf8"));
  const chain = stored.network === "base" ? base : baseSepolia;
  const client = createPublicClient({ chain, transport: http() });

  let ethBalance = "desconocido";
  try {
    const bal = await client.getBalance({ address: stored.address as `0x${string}` });
    ethBalance = `${formatEther(bal)} ETH`;
  } catch {
    // red no alcanzable en este momento — no es fatal para mostrar info local
  }

  return {
    address: stored.address,
    network: stored.network,
    encrypted: stored.encrypted,
    ethBalance,
    explorer:
      stored.network === "base"
        ? `https://basescan.org/address/${stored.address}`
        : `https://sepolia.basescan.org/address/${stored.address}`,
  };
}
