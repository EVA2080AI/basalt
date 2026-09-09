import { marked } from "marked";
import type { Product } from "../../products/types.js";

const MAX_INPUT_CHARS = 200_000;

/**
 * Thirteenth Basalt product: converts Markdown to HTML — the reverse
 * direction of the existing html-to-markdown product, completing the
 * round trip. Pure parsing (marked), no external API.
 */
export const markdownToHtmlProduct: Product = {
  id: "markdown-to-html",
  method: "POST",
  path: "/markdown-to-html",
  priceUsd: Number(process.env.AUTOMATON_PRICE_MARKDOWN_TO_HTML_USD ?? 0.003),
  description: "Converts Markdown to HTML — the reverse direction of html-to-markdown.",
  launchedAt: "2026-09-09",
  inputSchema: { type: "object", required: ["markdown"], properties: { markdown: { type: "string" } } },
  inputExample: { markdown: "# Hello\n\nWorld" },
  outputSchema: { type: "object", properties: { html: { type: "string" } }, required: ["html"] },
  outputExample: { html: "<h1>Hello</h1>\n<p>World</p>\n" },
  async handler(req, res) {
    const markdown = req.body?.markdown;
    if (typeof markdown !== "string") {
      res.status(400).json({ error: "Body must include { markdown: string }" });
      return;
    }
    if (markdown.length > MAX_INPUT_CHARS) {
      res.status(413).json({ error: `Markdown exceeds the maximum of ${MAX_INPUT_CHARS} characters.` });
      return;
    }
    try {
      const html = await marked.parse(markdown);
      res.json({ html });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "Could not convert the Markdown." });
    }
  },
};
