/**
 * Segundo producto de Basalt: revisa si un dominio está disponible para
 * registrar, usando RDAP (el protocolo público que reemplazó a WHOIS).
 * rdap.org actúa como redirector al servidor RDAP correcto de cada registro,
 * así que no hace falta implementar el bootstrap IANA nosotros mismos.
 */

const DOMAIN_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/i;
const FETCH_TIMEOUT_MS = 8000;

export interface DomainCheckResult {
  domain: string;
  available: boolean;
  registrar: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  status: string[];
  source: "rdap";
  note?: string;
}

function normalizeDomain(input: string): string {
  const domain = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!DOMAIN_PATTERN.test(domain)) {
    throw new Error(`'${input}' no parece un dominio válido (ej: ejemplo.com).`);
  }
  return domain;
}

function extractRegistrar(entities: unknown): string | null {
  if (!Array.isArray(entities)) return null;
  for (const entity of entities) {
    if (!entity || typeof entity !== "object") continue;
    const e = entity as { roles?: string[]; vcardArray?: unknown; handle?: string };
    if (!e.roles?.includes("registrar")) continue;
    const vcard = e.vcardArray;
    if (Array.isArray(vcard) && Array.isArray(vcard[1])) {
      const fnEntry = (vcard[1] as unknown[]).find((f) => Array.isArray(f) && f[0] === "fn");
      if (Array.isArray(fnEntry) && typeof fnEntry[3] === "string") return fnEntry[3];
    }
    if (e.handle) return e.handle;
  }
  return null;
}

function extractEventDate(events: unknown, action: string): string | null {
  if (!Array.isArray(events)) return null;
  const match = (events as Array<{ eventAction?: string; eventDate?: string }>).find((e) => e.eventAction === action);
  return match?.eventDate ?? null;
}

export async function checkDomain(input: string): Promise<DomainCheckResult> {
  const domain = normalizeDomain(input);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/rdap+json",
        // rdap.org bloquea el User-Agent por defecto de Node (undici) en su WAF
        // y devuelve 403 en vez de redirigir al registro correcto. Confirmado
        // en vivo: mismo request, solo cambia esto, pasa de 403 a 200.
        "User-Agent": "Mozilla/5.0 (compatible; BasaltAgent/0.1; +https://github.com/EVA2080AI/basalt)",
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 404) {
    return {
      domain,
      available: true,
      registrar: null,
      createdAt: null,
      expiresAt: null,
      status: [],
      source: "rdap",
    };
  }

  if (!res.ok) {
    throw new Error(`El registro RDAP respondió ${res.status} para '${domain}'. Puede que su TLD no soporte RDAP.`);
  }

  const data = (await res.json()) as { status?: string[]; entities?: unknown; events?: unknown };

  return {
    domain,
    available: false,
    registrar: extractRegistrar(data.entities),
    createdAt: extractEventDate(data.events, "registration"),
    expiresAt: extractEventDate(data.events, "expiration"),
    status: data.status ?? [],
    source: "rdap",
  };
}
