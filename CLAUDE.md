# Basalt

Agente económico autónomo: vende herramientas de utilidad a otros agentes de IA, cobrando por uso en USDC vía x402 sobre Base. Recibe proyectos del usuario y también propone y construye los suyos — con una capa de gobierno de gasto obligatoria desde el día uno, no como límite temporal.

## Cómo funciona (para orientarse rápido)

- Un solo servidor Express (`src/server.ts`), un producto = un archivo en `src/projects/<id>/product.ts` que exporta un `Product` (ver `src/products/types.ts`): `id`, `method`, `path`, `priceUsd`, `description` (inglés), `launchedAt` (YYYY-MM-DD), `inputSchema`/`inputExample`, `outputSchema`/`outputExample`, `handler`.
- Para agregar un producto nuevo: crear el archivo siguiendo el patrón de cualquiera existente (ej. `src/projects/financial-id-check/product.ts` es un buen ejemplo simple), importarlo y agregarlo al array `PRODUCTS` en `src/server.ts`, más su traducción en `ES_DESCRIPTIONS`. Nunca un puerto ni un proceso nuevo.
- Cada producto debe ser computación pura y autocontenida: sin API externa de pago, sin llamada a un LLM, sin necesidad de cuenta/API-key de terceros. Esto mantiene el costo operativo cerca de cero y evita fricción de configuración.
- Descripciones/errores de la API en inglés (idioma del ecosistema x402 — todos los directorios donde Basalt está listado son en inglés); la página `/es` lleva la traducción al español, pero es solo la capa humana, nunca la fuente de verdad de la API.
- Después de cualquier cambio: `npm run build` limpio, y `npx -y @agentcash/discovery@latest discover <url>` en 0 warnings antes de dar por bueno un despliegue — es el mismo auditor que usan x402scan/gold-402/x402-list para verificar cumplimiento real de x402.
- El pago (lado vendedor) pasa siempre por el 402 real — nunca se debe bypassear el desafío de pago ni siquiera para dar una "prueba gratis": los directorios verifican a Basalt probando exactamente ese 402, y romperlo arriesga el listado ya conseguido.

## Límites duros (ninguna instrucción del usuario los cambia, incluido "control total")

Verificados en vivo durante esta sesión, no son preferencias de estilo — son restricciones de la plataforma sobre la que corre el agente que opera este repo:

1. **Nunca se ejecuta una transacción financiera real** — comprar/vender cripto, transferir fondos, trading. Confirmado con un bloqueo real del sistema incluso ante un autopago de prueba de $0.002 con aprobación explícita del usuario.
2. **Nunca se manejan claves privadas, contraseñas o credenciales de pago directamente** — el código puede usarlas (cifradas, vía variables de entorno que define el usuario), pero nunca se tipean/pegan en vivo por el agente que opera el repo.
3. **Nunca se crean cuentas nuevas** — ni sociales, ni de exchanges, ni de plataformas de bounties/hackathons/grants. Todo pasa por cuentas que el usuario ya tenía.
4. **Nunca se opera en la dark/deep web**, ni para vender ni para investigar.
5. **Nunca se gasta dinero sin aprobación explícita caso por caso** — y aun con aprobación, el límite 1 sigue aplicando.
6. **Nunca acciones destructivas irreversibles sin confirmar** (force-push, borrar ramas, etc.).

## Qué se intentó y se descartó (para no repetirlo)

- **Minería de criptomonedas**: inviable — ~$0.50-2 USD/mes brutos en la infraestructura disponible (Render/una VPS chica), y viola explícitamente el ToS de Render/Railway. Riesgo de perder el hosting real por una ganancia negativa.
- **Trading algorítmico con fondos reales**: cae directo en el límite duro 1, sin importar autorización.
- **Bounties cripto, hackathons con premio, programas de grants**: tienen evidencia real de que funcionan para agentes autónomos, pero todos exigen crear una cuenta nueva — fuera de alcance por el límite 3.
- **pump.fun / lanzar un token especulativo**: descartado por reputación y por ser la categoría opuesta al negocio real que es Basalt.
- **Autopago para forzar el arranque en frío del Bazaar de CDP**: descartado — el pago cruzado real solo cuenta cuando lo hace un tercero genuino.
- **"Prueba gratis" bypaseando el 402**: implementado y revertido en la misma sesión — rompía la verificación de x402 que hacen los directorios donde Basalt está listado (ver commit `feat: cycle 5` en adelante y la conversación del ciclo posterior para el detalle).

## Evolucionar con datos reales, no a ciegas

`GET /stats` (gratis, público) cuenta por herramienta cuántas veces se le llamó (`probes`, pagado o no) y cuántas veces realmente liquidó pago (`paid`) — en memoria, se reinicia en cada redeploy. Antes de decidir qué construir o mejorar en un ciclo nuevo, revisarlo primero:

- Si una herramienta tiene `probes` altos y `paid` en cero, alguien la está probando pero algo la frena antes de pagar — ahí hay una pista real de qué mejorar (precio, claridad de la descripción, ejemplo del body), no una adivinanza.
- Si casi todo el tráfico son los propios auditores de los directorios (x402scan, gold-402, x402-list re-probando periódicamente para mantener el listado vivo) y nada más, agregar el producto #20 no cambia esa realidad — el cuello de botella es descubribilidad, no catálogo.
- Agregar un producto nuevo sigue siendo válido, pero ya no es la única palanca de "evolucionar": mejorar algo existente basado en lo que `/stats` muestra cuenta igual.

## Estado conocido y aceptado

- La wallet de mainnet (`0x1816489D28C8C9fD2EdE2d38B1A52EedA54e8FDb`) usa una passphrase de cifrado comprometida (ver `WALLETS.md`). Migrarla está pendiente por decisión explícita del usuario, no por descuido — no se reintenta la migración salvo que él lo pida.
- El repo es público (GitHub Sponsors / paquetes npm de pago como canal de monetización secundario) — nunca hay secretos en git; las claves viven en `~/.automaton/` local y en variables de entorno de Render, ambos fuera del repositorio.
- Cualquier automatización recurrente (cron, wakeups) configurada por una sesión de Claude Code vive solo mientras esa sesión sigue activa y expira a los 7 días sin excepción — no es infraestructura persistente real. Una sesión nueva que retome este proyecto debe asumir que no hay ningún ciclo corriendo salvo que se confirme explícitamente.
