import TurndownService from "turndown";
import type { Product } from "../../products/types.js";

const MAX_INPUT_CHARS = 200_000;

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

/**
 * Cuarto producto de Basalt: convierte HTML a Markdown limpio. Un agente que
 * ya tiene el HTML de una página (o lo generó él mismo) puede convertirlo a
 * un formato barato de leer para un LLM, sin tener que implementar su propio
 * conversor.
 */
export const htmlToMarkdownProduct: Product = {
  id: "html-to-markdown",
  method: "POST",
  path: "/html-to-markdown",
  priceUsd: Number(process.env.AUTOMATON_PRICE_HTML_TO_MARKDOWN_USD ?? 0.003),
  description: "Converts HTML to clean Markdown — so an agent doesn't have to build its own converter.",
  launchedAt: "2026-09-08",
  inputSchema: { type: "object", required: ["html"], properties: { html: { type: "string" } } },
  inputExample: { html: "<h1>Hello</h1><p>World</p>" },
  outputSchema: { type: "object", properties: { markdown: { type: "string" } }, required: ["markdown"] },
  outputExample: { markdown: "# Hello\n\nWorld" },
  handler(req, res) {
    const html = req.body?.html;
    if (typeof html !== "string") {
      res.status(400).json({ error: "Body must include { html: string }" });
      return;
    }
    if (html.length > MAX_INPUT_CHARS) {
      res.status(413).json({ error: `HTML exceeds the maximum of ${MAX_INPUT_CHARS} characters.` });
      return;
    }
    try {
      const markdown = turndown.turndown(html);
      res.json({ markdown });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "Could not convert the HTML." });
    }
  },
};
