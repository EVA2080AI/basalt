# Basalt

Un agente económico autónomo: recibe proyectos, propone otros por su cuenta, y paga y cobra en cripto real vía x402/USDC sobre Base — con una capa de gobierno de gasto obligatoria desde el primer dólar, no como límite temporal.

Inspirado en [Conway](https://conway.tech) / [Web 4.0](https://web4.ai), pero con una diferencia estructural: en Conway el agente que decide también firma; en Basalt, entre la decisión y la firma se interpone una capa de gobierno (`src/governance/`) que Conway no tiene.

Documento de arquitectura completo: ver el artifact publicado en la conversación (roadmap, comparación con Conway, riesgos y decisiones abiertas).

## Estado

**Fase 1 y 2 completas.** Wallet real en **Base Sepolia (testnet)**, primer producto (`url-metadata`) corriendo, y capa de gobierno con canal de aprobación humana real.

Verificado en vivo contra un servidor real corriendo localmente (no solo probado manualmente — ver `src/governance/policy.test.ts` para lo automatizado):
- ✅ generación de wallet real en Base Sepolia, con USDC y ETH de testnet fondeados
- ✅ pago x402 real liquidado on-chain de punta a punta (challenge → firma → verificación → settlement → dato entregado)
- ✅ intento de pago rechazado correctamente por saldo insuficiente antes de fondear — el ledger no lo contó como gasto
- ✅ gasto por encima del umbral de aprobación queda pendiente, se aprueba con `npm run governance:approve`, se liquida solo entonces, y la aprobación queda consumida (no reutilizable)
- ✅ tope diario bloquea un segundo gasto igual el mismo día, incluso con aprobación ya usada
- ✅ el spend control propio del SDK de x402 (@x402/evm) se alinea al monto exacto que aprobó nuestra política, en vez de simplemente subirle el límite por defecto

## Estructura

```
src/
  governance/   políticas de gasto, ledger local, aprobación humana, firewall semántico (v0)
  wallet/       identidad on-chain — testnet y mainnet en archivos separados
  payments/     cliente x402 (para pagar) y servidor x402 (para cobrar)
  projects/     productos concretos — el primero: url-metadata
```

## Primeros pasos

```bash
npm install
npm run wallet:init      # genera la wallet (testnet por defecto)
npm run wallet:info      # dirección, red, saldo de ETH y USDC
npm run dev:url-metadata # levanta la API de pago (POST /extract, $0.005 USDC)
npm test                 # tests de la política de gasto
```

Para que un pago real se liquide, la wallet necesita fondos de testnet:
- USDC de testnet: https://faucet.circle.com (elegir red "Base Sepolia")
- ETH de Base Sepolia (por si se necesita gas más adelante): cualquier faucet de Base Sepolia

Cuando un gasto queda pendiente de aprobación:
```bash
npm run governance:pending          # ver qué hay pendiente
npm run governance:approve -- <id>  # o governance:reject
```

## Desplegar (Render)

El repo trae `render.yaml` listo para un despliegue tipo Blueprint:

1. En [render.com](https://render.com), conecta tu cuenta de GitHub (tú, no yo — es tu cuenta).
2. **New +** → **Blueprint** → selecciona el repo `EVA2080AI/basalt`. Render detecta `render.yaml` solo.
3. Te va a pedir el valor de `AUTOMATON_PRIVATE_KEY` (queda marcado como secreto, nunca viaja por el repo). Ábrelo tú mismo desde tu máquina — nunca por un formulario que yo maneje:
   ```bash
   cat ~/.automaton/wallet.base-sepolia.json
   ```
   copia el valor del campo `privateKey` y pégalo en el campo de Render.
4. Deploy. Cuando esté arriba, `GET /health` y `GET /products` deben responder sin pagar nada.

**Por qué una variable de entorno y no el archivo de siempre:** el disco de un contenedor en la nube no es persistente entre despliegues — si guardáramos la wallet en un archivo ahí, cada redeploy generaría una identidad nueva y perderíamos acceso a los fondos ya cargados. `AUTOMATON_PRIVATE_KEY` como secreto de la plataforma resuelve eso; cuando está definida, `src/wallet/wallet.ts` la usa directo y no toca el filesystem.

**Limitación conocida:** en el plan free, el ledger de gasto y las aprobaciones pendientes (`~/.automaton/ledger.json` / `approvals.json`) tampoco persisten entre despliegues — solo la identidad (la wallet) sobrevive, vía la variable de entorno. Para que el historial de gasto sobreviva un redeploy hace falta un disco persistente (plan pago) o una base de datos real — pendiente para cuando el volumen lo justifique.

## Mainnet real requiere un facilitator distinto

El facilitator público gratuito (`https://x402.org/facilitator`, el que se usa por defecto arriba) **solo soporta Base Sepolia**. Intentar mainnet con él falla al arrancar con `RouteConfigurationError: Facilitator does not support scheme "exact" on network "eip155:8453"` — confirmado en producción, no es un supuesto.

Para Base mainnet, Basalt usa el **CDP Facilitator de Coinbase Developer Platform** (`@coinbase/x402`) automáticamente en cuanto detecta credenciales:

```bash
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
```

Se obtienen creando una cuenta gratuita en [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com) (gratis hasta 1,000 liquidaciones/mes). Sin credenciales de CDP, `AUTOMATON_ALLOW_MAINNET=true` falla al arrancar con un error propio y claro, en vez del error críptico de la librería — ver `src/payments/x402Server.ts`.

## Reglas de seguridad (no negociables en este repo)

- **Mainnet nunca se activa por accidente.** Requiere `AUTOMATON_ALLOW_MAINNET=true` explícito, y una wallet de mainnet no se crea sin `AUTOMATON_WALLET_PASSPHRASE` — nunca se guarda una clave con dinero real sin cifrar.
- **Testnet y mainnet viven en archivos separados** (`~/.automaton/wallet.base-sepolia.json` vs `wallet.base.json`) — nunca el mismo archivo reinterpretado según una variable de entorno.
- **La clave privada nunca se commitea.** Vive fuera del repo, en `~/.automaton/`.
- **Ningún pago sale sin pasar por `governance/policy.ts` y, si aplica, `governance/approvals.ts`.** Tope diario, tope por herramienta y aprobación humana se evalúan antes de firmar — nunca después.
- **El ledger de gasto solo registra liquidaciones reales**, y **una aprobación solo autoriza un pago, nunca dos.**
