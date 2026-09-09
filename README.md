# Basalt

Un agente económico autónomo: recibe proyectos, propone otros por su cuenta, y paga y cobra en cripto real vía x402/USDC sobre Base — con una capa de gobierno de gasto obligatoria desde el primer dólar, no como límite temporal.

Inspirado en [Conway](https://conway.tech) / [Web 4.0](https://web4.ai), pero con una diferencia estructural: en Conway el agente que decide también firma; en Basalt, entre la decisión y la firma se interpone una capa de gobierno (`src/governance/`) que Conway no tiene.

Documento de arquitectura completo: ver el artifact publicado en la conversación (roadmap, comparación con Conway, riesgos y decisiones abiertas).

## Estado

Fase 1 en curso: motor base + wallet real en **Base Sepolia (testnet)** + primer producto (`url-metadata`, una API x402 que cobra a otros agentes por extraer metadata limpia de una URL).

Verificado en vivo contra un servidor real corriendo localmente:
- ✅ generación de wallet real en Base Sepolia
- ✅ challenge 402 real servido con el precio, red y `payTo` correctos
- ✅ intento de pago real rechazado correctamente por saldo insuficiente (`invalid_exact_evm_insufficient_balance`) — la wallet de testnet todavía no tiene fondos
- ✅ la capa de gobierno solo anota un gasto en el ledger si la liquidación realmente tuvo éxito

## Estructura

```
src/
  governance/   políticas de gasto, ledger local, firewall semántico (v0)
  wallet/       identidad on-chain (Base Sepolia por defecto; mainnet requiere opt-in explícito)
  payments/     cliente x402 (para pagar) y servidor x402 (para cobrar)
  projects/     productos concretos — el primero: url-metadata
```

## Primeros pasos

```bash
npm install
npm run wallet:init      # genera la wallet (testnet por defecto)
npm run wallet:info      # dirección, red, balance
npm run dev:url-metadata # levanta la API de pago (POST /extract, $0.005 USDC)
```

Para que un pago real se liquide, la wallet necesita fondos de testnet:
- ETH de Base Sepolia: cualquier faucet de Base Sepolia
- USDC de testnet: https://faucet.circle.com

## Reglas de seguridad (no negociables en este repo)

- **Mainnet nunca se activa por accidente.** Requiere `AUTOMATON_ALLOW_MAINNET=true` explícito.
- **La clave privada nunca se commitea.** Vive en `~/.automaton/wallet.json`, fuera del repo.
- **Ningún pago sale sin pasar por `governance/policy.ts`.** Toda ruta de pago (cliente x402) evalúa tope diario, tope por herramienta y umbral de aprobación humana antes de firmar — nunca después.
- **El ledger de gasto solo registra liquidaciones reales.** Un intento de pago fallido no cuenta como gasto.
