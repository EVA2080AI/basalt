import type { Product } from "../../products/types.js";
import { buildPage, THEMES, type PageSpec } from "./build.js";

/**
 * Twenty-second Basalt product: turns structured content into one complete,
 * self-contained HTML page.
 *
 * Why an agent pays for this instead of concatenating its own HTML: the hard
 * part was never the markup, it's everything around it. The page has to survive
 * a phone at 400px without sideways scroll, read correctly in both light and
 * dark, keep tables from breaking the layout, and — the part that actually
 * bites — escape every piece of caller-supplied text so a value like
 * `</script><img onerror=…>` renders as characters instead of executing. An
 * agent that writes this itself gets it wrong in a way it won't notice until
 * someone opens the page.
 *
 * Output is one file with no external requests: no CDN, no font host, no
 * analytics. It renders offline and in a sandbox, which is what a caller
 * embedding it somewhere else needs.
 *
 * Pure computation: no LLM, no network, no template service. It does not invent
 * content — it lays out exactly the blocks it is given.
 */
export const pageBuildProduct: Product = {
  id: "page-build",
  method: "POST",
  path: "/page-build",
  // Precio fijado con el índice de pares: la mediana del mercado es $0.02 y el
  // p75 $0.05. Produce un artefacto completo, no una conversión de una línea
  // como markdown-to-html ($0.003), así que va en la mediana.
  priceUsd: Number(process.env.AUTOMATON_PRICE_PAGE_BUILD_USD ?? 0.02),
  description:
    "Builds one complete, self-contained HTML page from structured blocks — responsive, light/dark aware, every value escaped, zero external requests.",
  descriptionEs:
    "Construye una página HTML completa y autocontenida a partir de bloques estructurados — responsiva, con modo claro y oscuro, todo valor escapado y sin un solo request externo.",
  launchedAt: "2026-09-25",
  inputSchema: {
    type: "object",
    required: ["title", "blocks"],
    properties: {
      title: { type: "string", description: "Page title, used in <title> and as the heading." },
      subtitle: { type: "string" },
      theme: { type: "string", enum: Object.keys(THEMES), description: "Visual palette." },
      lang: { type: "string", description: "BCP 47 language tag for the <html> element. Default 'en'." },
      blocks: {
        type: "array",
        minItems: 1,
        description: "Content in order. Unknown block types are rejected rather than silently dropped.",
        items: {
          type: "object",
          required: ["type"],
          properties: {
            type: { type: "string", enum: ["heading", "text", "list", "table", "stat", "code", "divider"] },
            text: { type: "string", description: "For heading, text and code." },
            level: { type: "integer", description: "For heading: 2 or 3. Default 2." },
            items: { type: "array", items: { type: "string" }, description: "For list." },
            ordered: { type: "boolean", description: "For list: numbered instead of bulleted." },
            columns: { type: "array", items: { type: "string" }, description: "For table." },
            rows: { type: "array", items: { type: "array", items: { type: "string" } }, description: "For table." },
            label: { type: "string", description: "For stat." },
            value: { type: "string", description: "For stat." },
            note: { type: "string", description: "For stat." },
            language: { type: "string", description: "For code: shown as a label, not highlighted." },
          },
        },
      },
    },
  },
  inputExample: {
    title: "Settlement Report",
    subtitle: "Base mainnet, week 39",
    theme: "slate",
    blocks: [
      { type: "stat", label: "Settled calls", value: "1,284", note: "up from 903" },
      { type: "heading", text: "By endpoint" },
      {
        type: "table",
        columns: ["endpoint", "calls", "usdc"],
        rows: [
          ["/extract", "612", "3.06"],
          ["/qrcode", "672", "1.34"],
        ],
      },
      { type: "text", text: "Every figure comes from settled x402 payments, not probes." },
    ],
  },
  outputSchema: {
    type: "object",
    properties: {
      html: { type: "string", description: "The complete document, starting with <!doctype html>." },
      bytes: { type: "integer", description: "Byte length of the html field, UTF-8." },
      blocks: { type: "integer", description: "Blocks rendered." },
      theme: { type: "string" },
    },
    required: ["html", "bytes", "blocks", "theme"],
  },
  outputExample: {
    html: "<!doctype html><html lang=\"en\">…</html>",
    bytes: 4213,
    blocks: 4,
    theme: "slate",
  },
  handler(req, res) {
    const body = (req.body ?? {}) as Record<string, unknown>;

    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      res.status(400).json({ error: "Body must include { title: string } with a non-empty title." });
      return;
    }
    if (!Array.isArray(body.blocks) || body.blocks.length === 0) {
      res.status(400).json({ error: "Body must include { blocks: [...] } with at least one block." });
      return;
    }
    if (body.blocks.length > 200) {
      res.status(400).json({ error: "At most 200 blocks per page." });
      return;
    }
    if (body.theme !== undefined && !(typeof body.theme === "string" && body.theme in THEMES)) {
      res.status(400).json({
        error: `Unknown theme. Available: ${Object.keys(THEMES).join(", ")}.`,
      });
      return;
    }

    let html: string;
    try {
      html = buildPage(body as unknown as PageSpec);
    } catch (err) {
      // Un tipo de bloque desconocido se rechaza en vez de descartarse en
      // silencio: el comprador pagó por una página con N bloques y tiene que
      // enterarse si uno no se pudo renderizar.
      res.status(400).json({ error: err instanceof Error ? err.message : "Invalid blocks." });
      return;
    }

    res.json({
      html,
      bytes: Buffer.byteLength(html, "utf8"),
      blocks: body.blocks.length,
      theme: typeof body.theme === "string" ? body.theme : "slate",
    });
  },
};
