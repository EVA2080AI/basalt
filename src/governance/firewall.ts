/**
 * Firewall semántico (v0, heurístico): separa "contenido no confiable" de
 * "autorización de gasto". Nada que pase por acá puede, por sí mismo, decidir
 * cuánto gastar o a quién pagar — esos valores siempre vienen de la política
 * (governance/policy.ts), nunca del texto que el agente lee en la web.
 *
 * Esto es un primer filtro, no una solución completa de seguridad contra
 * prompt injection. Documentado como riesgo abierto en el §7 del plan.
 */

const INJECTION_PATTERNS = [
  /ignore (all|previous|the above) instructions/i,
  /disregard (your|all) (previous )?instructions/i,
  /you are now/i,
  /transfer .* (usdc|eth|funds|to address)/i,
  /send (payment|usdc|eth) to 0x[a-f0-9]{40}/i,
  /actúa como/i,
  /ignora (las )?instrucciones/i,
];

export interface UntrustedContent {
  source: string;
  text: string;
}

export interface FirewallResult {
  suspicious: boolean;
  matchedPatterns: string[];
}

/** Marca contenido externo (HTML, respuestas de terceros, etc.) como no confiable. */
export function tagUntrusted(source: string, text: string): UntrustedContent {
  return { source, text };
}

/** Escanea contenido no confiable en busca de intentos evidentes de manipular al agente. */
export function scanForInjection(content: UntrustedContent): FirewallResult {
  const matched = INJECTION_PATTERNS.filter((p) => p.test(content.text)).map((p) => p.source);
  return { suspicious: matched.length > 0, matchedPatterns: matched };
}

/**
 * Invariante estructural: esta función NUNCA debe ser llamada con valores
 * extraídos de UntrustedContent. amountUsd y counterparty deben originarse
 * siempre en código de confianza (config de producto, no output de LLM sobre
 * texto ajeno).
 */
export function assertNotDerivedFromUntrustedContent(_amountUsd: number, _counterparty: string | undefined): void {
  // Punto de documentación/control: cualquier PR que rompa esta invariante
  // (pasar un valor leído de contenido externo directo a evaluateSpend)
  // debe ser rechazado en revisión.
}
