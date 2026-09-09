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

## Reglas de seguridad (no negociables en este repo)

- **Mainnet nunca se activa por accidente.** Requiere `AUTOMATON_ALLOW_MAINNET=true` explícito, y una wallet de mainnet no se crea sin `AUTOMATON_WALLET_PASSPHRASE` — nunca se guarda una clave con dinero real sin cifrar.
- **Testnet y mainnet viven en archivos separados** (`~/.automaton/wallet.base-sepolia.json` vs `wallet.base.json`) — nunca el mismo archivo reinterpretado según una variable de entorno.
- **La clave privada nunca se commitea.** Vive fuera del repo, en `~/.automaton/`.
- **Ningún pago sale sin pasar por `governance/policy.ts` y, si aplica, `governance/approvals.ts`.** Tope diario, tope por herramienta y aprobación humana se evalúan antes de firmar — nunca después.
- **El ledger de gasto solo registra liquidaciones reales**, y **una aprobación solo autoriza un pago, nunca dos.**
