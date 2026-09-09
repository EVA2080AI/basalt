import * as cheerio from "cheerio";
import { tagUntrusted, scanForInjection } from "../../governance/firewall.js";

export interface UrlMetadata {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  canonicalUrl: string | null;
  textExcerpt: string;
  warning?: string;
}

const MAX_EXCERPT_CHARS = 1200;
const FETCH_TIMEOUT_MS = 8000;

/**
 * Primer producto de Automaton: extrae metadata limpia de una URL para que
 * otros agentes no tengan que parsear HTML crudo ellos mismos.
 */
export async function extractUrlMetadata(targetUrl: string): Promise<UrlMetadata> {
  const parsed = new URL(targetUrl); // lanza si la URL es inválida
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Solo se admiten URLs http/https.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let html: string;
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "AutomatonBot/0.1 (+https://github.com/)" },
    });
    if (!res.ok) throw new Error(`El sitio respondió ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timeout);
  }

  // Todo el HTML de terceros se trata como contenido no confiable: se usa
  // solo para EXTRAER datos, nunca para tomar decisiones de gasto.
  const untrusted = tagUntrusted(parsed.toString(), html);
  const firewallResult = scanForInjection(untrusted);

  const $ = cheerio.load(html);
  const meta = (name: string) =>
    $(`meta[property="${name}"]`).attr("content") ?? $(`meta[name="${name}"]`).attr("content") ?? null;

  const bodyText = $("body").clone().find("script,style,noscript").remove().end().text().replace(/\s+/g, " ").trim();

  return {
    url: parsed.toString(),
    title: meta("og:title") ?? ($("title").first().text().trim() || null),
    description: meta("og:description") ?? meta("description"),
    image: meta("og:image"),
    siteName: meta("og:site_name"),
    canonicalUrl: $('link[rel="canonical"]').attr("href") ?? null,
    textExcerpt: bodyText.slice(0, MAX_EXCERPT_CHARS),
    ...(firewallResult.suspicious
      ? { warning: "El contenido de esta URL contiene patrones asociados a prompt injection. Tratar con cautela." }
      : {}),
  };
}
