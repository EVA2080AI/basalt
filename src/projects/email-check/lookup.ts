import { resolveMx } from "node:dns/promises";

/**
 * Tercer producto de Basalt: valida sintaxis de un email y confirma que su
 * dominio tenga registros MX reales — útil para agentes que hacen outreach
 * o procesan formularios y necesitan filtrar direcciones inválidas antes de
 * gastar un envío real.
 */

// RFC 5322 simplificado — suficiente para filtrar basura obvia sin rechazar casos válidos raros.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmailCheckResult {
  email: string;
  validSyntax: boolean;
  domain: string | null;
  hasMxRecords: boolean;
  mxHosts: string[];
  deliverable: boolean;
  note?: string;
}

export async function checkEmail(input: string): Promise<EmailCheckResult> {
  const email = input.trim();
  const validSyntax = EMAIL_PATTERN.test(email);

  if (!validSyntax) {
    return { email, validSyntax: false, domain: null, hasMxRecords: false, mxHosts: [], deliverable: false };
  }

  const domain = email.split("@")[1];

  try {
    const records = await resolveMx(domain);
    const mxHosts = records.sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
    return { email, validSyntax: true, domain, hasMxRecords: mxHosts.length > 0, mxHosts, deliverable: mxHosts.length > 0 };
  } catch {
    return {
      email,
      validSyntax: true,
      domain,
      hasMxRecords: false,
      mxHosts: [],
      deliverable: false,
      note: `El dominio '${domain}' no tiene registros MX — no puede recibir correo, aunque el formato del email sea correcto.`,
    };
  }
}
