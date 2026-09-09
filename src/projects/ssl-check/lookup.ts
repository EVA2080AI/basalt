import { connect, type PeerCertificate } from "node:tls";

/**
 * Séptimo producto de Basalt: revisa el certificado TLS de un dominio — útil
 * para un agente que monitorea sitios que lanzó, o que evalúa uno ajeno
 * antes de integrarse con él.
 */

const DOMAIN_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/i;
const TIMEOUT_MS = 8000;

export interface SslCheckResult {
  domain: string;
  valid: boolean;
  issuer: string | null;
  subject: string | null;
  validFrom: string;
  validTo: string;
  daysUntilExpiry: number;
  expired: boolean;
}

function normalizeDomain(input: string): string {
  const domain = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
  if (!DOMAIN_PATTERN.test(domain)) {
    throw new Error(`'${input}' no parece un dominio válido (ej: ejemplo.com).`);
  }
  return domain;
}

function firstOrSelf(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatName(name: PeerCertificate["issuer"] | undefined): string | null {
  if (!name) return null;
  return firstOrSelf(name.O) ?? firstOrSelf(name.CN) ?? null;
}

export function checkSsl(input: string): Promise<SslCheckResult> {
  const domain = normalizeDomain(input);

  return new Promise((resolve, reject) => {
    const socket = connect(
      { host: domain, port: 443, servername: domain, timeout: TIMEOUT_MS },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();

        if (!cert || Object.keys(cert).length === 0) {
          reject(new Error(`No se pudo obtener el certificado de '${domain}'.`));
          return;
        }

        const validTo = new Date(cert.valid_to);
        const daysUntilExpiry = Math.ceil((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        resolve({
          domain,
          valid: socket.authorized,
          issuer: formatName(cert.issuer),
          subject: formatName(cert.subject),
          validFrom: new Date(cert.valid_from).toISOString(),
          validTo: validTo.toISOString(),
          daysUntilExpiry,
          expired: daysUntilExpiry < 0,
        });
      },
    );

    socket.on("error", (err) => reject(new Error(`No se pudo conectar a '${domain}': ${err.message}`)));
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`Tiempo de espera agotado conectando a '${domain}'.`));
    });
  });
}
