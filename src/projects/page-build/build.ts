/**
 * El generador. Separado del producto para poder testear el HTML sin pasar por
 * Express, igual que `lookup.ts` en domain-check.
 */

export interface PageSpec {
  title: string;
  subtitle?: string;
  theme?: string;
  lang?: string;
  blocks: Block[];
}

export type Block =
  | { type: "heading"; text?: string; level?: number }
  | { type: "text"; text?: string }
  | { type: "list"; items?: string[]; ordered?: boolean }
  | { type: "table"; columns?: string[]; rows?: string[][] }
  | { type: "stat"; label?: string; value?: string; note?: string }
  | { type: "code"; text?: string; language?: string }
  | { type: "divider" };

interface Theme {
  /** claro: fondo, superficie, tinta, tinta secundaria, línea, acento */
  light: [string, string, string, string, string, string];
  dark: [string, string, string, string, string, string];
  font: string;
}

export const THEMES: Record<string, Theme> = {
  slate: {
    light: ["#EEF1F3", "#FBFCFC", "#151A1D", "#4A575E", "#D2DADE", "#1B5E7E"],
    dark: ["#0F1214", "#171B1E", "#E6EBEE", "#A8B5BC", "#293135", "#6FB8D6"],
    font: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  warm: {
    light: ["#F2EEE8", "#FCFAF7", "#1D1814", "#574C42", "#DED5C9", "#8A4B24"],
    dark: ["#14110F", "#1C1816", "#EDE7E0", "#B8ADA2", "#332C27", "#D89463"],
    font: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  },
  mono: {
    light: ["#F4F4F4", "#FFFFFF", "#000000", "#444444", "#D8D8D8", "#000000"],
    dark: ["#0D0D0D", "#161616", "#F2F2F2", "#B0B0B0", "#2C2C2C", "#FFFFFF"],
    font: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  },
};

/**
 * Escape de todo texto que venga del llamador.
 *
 * Esta función es la razón por la que el producto vale algo. Se escapan las
 * cinco entidades, incluidas la comilla simple y la doble, porque el texto
 * también termina dentro de atributos. Sin esto, un valor como
 * `"><script>fetch(...)</script>` se ejecutaría en el navegador de quien abra la
 * página, y el que la generó no se enteraría nunca.
 */
export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Un tag de lenguaje que no sea inofensivo se descarta. */
function safeLang(lang: unknown): string {
  return typeof lang === "string" && /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(lang) ? lang : "en";
}

function renderBlock(b: Block, index: number): string {
  switch (b.type) {
    case "heading": {
      const level = b.level === 3 ? 3 : 2;
      return `<h${level}>${esc(b.text)}</h${level}>`;
    }
    case "text":
      return `<p>${esc(b.text)}</p>`;

    case "list": {
      const items = Array.isArray(b.items) ? b.items : [];
      const tag = b.ordered ? "ol" : "ul";
      return `<${tag}>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</${tag}>`;
    }

    case "table": {
      const cols = Array.isArray(b.columns) ? b.columns : [];
      const rows = Array.isArray(b.rows) ? b.rows : [];
      const head = cols.length ? `<thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>` : "";
      const bodyRows = rows
        .map((r) => `<tr>${(Array.isArray(r) ? r : []).map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
        .join("");
      // El contenedor con overflow propio es lo que evita que una tabla ancha
      // haga scrollear la página entera de costado en un teléfono.
      return `<div class="tw"><table>${head}<tbody>${bodyRows}</tbody></table></div>`;
    }

    case "stat":
      return (
        `<div class="stat"><span class="sl">${esc(b.label)}</span>` +
        `<span class="sv">${esc(b.value)}</span>` +
        (b.note ? `<span class="sn">${esc(b.note)}</span>` : "") +
        `</div>`
      );

    case "code":
      return (
        `<figure class="code">` +
        (b.language ? `<figcaption>${esc(b.language)}</figcaption>` : "") +
        `<pre><code>${esc(b.text)}</code></pre></figure>`
      );

    case "divider":
      return `<hr>`;

    default: {
      const t = (b as { type?: unknown }).type;
      throw new Error(`Unknown block type "${String(t)}" at index ${index}. Supported: heading, text, list, table, stat, code, divider.`);
    }
  }
}

export function buildPage(spec: PageSpec): string {
  const theme = THEMES[typeof spec.theme === "string" && spec.theme in THEMES ? spec.theme : "slate"];
  const [bg, surf, ink, ink2, line, accent] = theme.light;
  const [dbg, dsurf, dink, dink2, dline, daccent] = theme.dark;
  const lang = safeLang(spec.lang);

  const body = spec.blocks.map(renderBlock).join("\n");

  // Un solo archivo, sin un request externo: renderiza offline y dentro de un
  // sandbox, que es lo que necesita quien la embeba en otro lado.
  const css = `
:root{--bg:${bg};--surf:${surf};--ink:${ink};--ink2:${ink2};--line:${line};--ac:${accent};color-scheme:light}
@media(prefers-color-scheme:dark){:root{--bg:${dbg};--surf:${dsurf};--ink:${dink};--ink2:${dink2};--line:${dline};--ac:${daccent};color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:${theme.font};font-size:16px;line-height:1.6;-webkit-text-size-adjust:100%}
.wrap{max-width:46rem;margin:0 auto;padding-inline:16px;padding-block:2.5rem 4rem}
header{border-bottom:1px solid var(--line);padding-bottom:1.25rem;margin-bottom:2rem}
h1{font-size:clamp(1.6rem,4.5vw,2.2rem);line-height:1.2;margin:0;text-wrap:balance}
.sub{color:var(--ink2);margin:.5rem 0 0;font-size:1.0625rem}
h2{font-size:1.25rem;margin:2rem 0 .5rem;text-wrap:balance}
h3{font-size:1.0625rem;margin:1.5rem 0 .4rem;text-wrap:balance}
p{margin:0 0 1rem;max-width:65ch}
ul,ol{margin:0 0 1rem;padding-left:1.4rem}
li{margin-bottom:.3rem}
hr{border:0;border-top:1px solid var(--line);margin:2rem 0}
.tw{overflow-x:auto;margin:0 0 1.25rem;border:1px solid var(--line);border-radius:3px}
table{border-collapse:collapse;width:100%;font-size:.9375rem}
th,td{text-align:left;padding:.5rem .7rem;border-bottom:1px solid var(--line)}
th{background:var(--surf);font-weight:600;white-space:nowrap}
tbody tr:last-child td{border-bottom:0}
td{font-variant-numeric:tabular-nums}
.stat{display:flex;flex-direction:column;gap:.15rem;background:var(--surf);border:1px solid var(--line);border-left:3px solid var(--ac);border-radius:3px;padding:.85rem 1rem;margin:0 0 1.25rem}
.sl{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2)}
.sv{font-size:1.75rem;line-height:1.15;font-variant-numeric:tabular-nums}
.sn{font-size:.875rem;color:var(--ink2)}
.code{margin:0 0 1.25rem;border:1px solid var(--line);border-radius:3px;overflow:hidden;background:var(--surf)}
.code figcaption{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2);padding:.4rem .7rem;border-bottom:1px solid var(--line)}
.code pre{margin:0;padding:.8rem .7rem;overflow-x:auto}
.code code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.875rem}
img{max-width:100%}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}`.trim();

  return (
    `<!doctype html>\n<html lang="${esc(lang)}">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">\n` +
    `<title>${esc(spec.title)}</title>\n<style>${css}</style>\n</head>\n<body>\n` +
    `<div class="wrap">\n<header>\n<h1>${esc(spec.title)}</h1>\n` +
    (spec.subtitle ? `<p class="sub">${esc(spec.subtitle)}</p>\n` : "") +
    `</header>\n${body}\n</div>\n</body>\n</html>\n`
  );
}
