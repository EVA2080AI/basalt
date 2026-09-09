# Wallets de Basalt

Registro de las identidades on-chain del proyecto. Solo direcciones públicas —
**ninguna clave privada vive en este archivo ni en este repo, nunca.**

## Activa (Base Sepolia — testnet, dinero de prueba)

| Entorno | Dirección | Dónde vive la clave |
|---|---|---|
| Local **y** Producción (Render) | `0x8815b8fa6EA6d08d80F03ef638A132A75eE4fF9c` | Local: `~/.automaton/wallet.base-sepolia.json` (sin cifrar — solo aceptable en testnet). Render: variable de entorno `AUTOMATON_PRIVATE_KEY` (secreto de la plataforma, nunca en el repo). |

[Ver en BaseScan](https://sepolia.basescan.org/address/0x8815b8fa6EA6d08d80F03ef638A132A75eE4fF9c) — balance real verificado: **19.995 USDC** (20 fondeados, 0.005 gastados en la prueba de pago contra producción).

Se fondea en **https://faucet.circle.com**, red **Base Sepolia**.

## Por qué es la misma wallet en los dos entornos

El disco de un contenedor en Render no es persistente entre despliegues ni entre reinicios por inactividad (el plan free "duerme" el servicio y lo despierta en cada request nuevo). Sin una identidad fija, cada reinicio generaba una wallet nueva y aleatoria — de hecho eso pasó dos veces durante la puesta en marcha (ver "Wallets efímeras perdidas" abajo), estrenando dinero de prueba en direcciones cuya clave nunca se guardó en ningún lado.

La solución fue inyectar la clave real como secreto de la plataforma (`AUTOMATON_PRIVATE_KEY`), tomada del mismo archivo local. El copy-paste a mano falló varias veces (una vez pegando la dirección en vez de la clave, otra vez con espacios/comillas de más, otra vez con el archivo local ya dañado — ver historial). La forma que finalmente funcionó sin errores: extraer el valor con un script que lee el JSON y lo copia directo al portapapeles (`python3 -c "import json; print(json.load(open('~/.automaton/wallet.base-sepolia.json'))['privateKey'], end='')" | pbcopy`), verificar el formato antes de pegarlo (`pbpaste | grep -qE '^0x[0-9a-fA-F]{64}$'`), y recién ahí pegar en Render — sin pasar nunca por selección manual de texto.

## Wallets abandonadas (histórico, no usar — todas con fondos de prueba, cero pérdida real)

| Dirección | Qué pasó |
|---|---|
| `0x6DA2663C0e800D21d7e7923732A696cfa7CD3460` | Primera wallet del proyecto, hizo los primeros pagos x402 reales (Fase 1 y 2). Su clave quedó sobrescrita por error en `~/.automaton/wallet.base-sepolia.json` al confundir la dirección de copia durante la configuración de Render. ~20 USDC de prueba inaccesibles. Copia del archivo dañado en `~/.automaton/wallet.base-sepolia.corrupted.json.bak`. |
| `0xc8fD526215F3f29e73882bb9cF8C18732c014fD4` | Wallet efímera generada por Render en el primer deploy exitoso, antes de configurar `AUTOMATON_PRIVATE_KEY`. Se perdió al siguiente reinicio del contenedor. 0 USDC (nunca se fondeó). |
| `0x2d7De4A837d399DBC470B3Db07e743a48c197fa9` | Segunda wallet efímera de Render, generada en un reinicio posterior. Recibió un pago real de prueba (0.005 USDC) antes de que notáramos que la dirección había cambiado entre el momento de cotizar el precio y el momento de liquidar el pago. Ese monto queda ahí, inaccesible. |

Lección aplicada: `src/wallet/wallet.ts` ahora sanea (espacios, comillas, prefijo `0x`) cualquier valor que llegue por `AUTOMATON_PRIVATE_KEY` antes de usarlo, y separa los archivos de wallet por red — pero ninguna validación de código evita que un humano edite el archivo equivocado a mano. Tratar `~/.automaton/wallet.*.json` como se trataría cualquier archivo de claves: no abrirlo para "probar cosas", solo para leer el valor de `privateKey` cuando haga falta.

## Mainnet — dinero real (Base)

| Dirección | Dónde vive la clave | Balance real |
|---|---|---|
| `0x1816489D28C8C9fD2EdE2d38B1A52EedA54e8FDb` | `~/.automaton/wallet.base.json`. Render: variable de entorno `AUTOMATON_PRIVATE_KEY`. | **47.82132 USDC** (fondeado desde Binance vía retiro a red Base, 2026-09-09) |

[Ver en BaseScan](https://basescan.org/address/0x1816489D28C8C9fD2EdE2d38B1A52EedA54e8FDb).

Verificación antes de fondear: dirección, red (Base) y contrato de USDC (`...02913`, el oficial) confirmados carácter por carácter contra la pantalla de retiro de Binance antes de que el usuario confirmara. Balance neto verificado directo on-chain, no solo en el historial de Binance.

### ⚠️ Contraseña de cifrado comprometida — migración pendiente

Al crear esta wallet, el usuario corrió el comando de ejemplo tal cual se le dio, sin reemplazar el placeholder `tu-contraseña-elegida` por una contraseña propia — así que esa frase literal, que apareció varias veces en esta conversación, es la contraseña real que cifra el archivo local. Confirmado técnicamente (sin exponer la clave privada): esa frase sí desbloquea `wallet.base.json`.

**Decisión del usuario:** seguir usando esta wallet mientras se termina de armar la infraestructura, y migrar a una wallet nueva (con una contraseña real, nunca compartida con el agente) más adelante. Hasta que eso ocurra, tratar los 47.82 USDC de esta dirección como si la contraseña no ofreciera protección real — es dinero expuesto a quien tenga acceso a esta conversación y al archivo local.

### Facilitator: el público no sirve para mainnet

Al intentar activar mainnet la primera vez, el deploy falló con `RouteConfigurationError: Facilitator does not support scheme "exact" on network "eip155:8453"`. El facilitator gratuito de `x402.org` (usado hasta ahora) solo soporta Base Sepolia — el propio repo oficial de x402 lo advierte explícitamente para mainnet. Se decidió usar el **CDP Facilitator de Coinbase Developer Platform** (`@coinbase/x402`, ver `src/payments/x402Server.ts`), el único con soporte oficial, documentado y con cumplimiento KYT/OFAC para Base mainnet. Requiere `CDP_API_KEY_ID` y `CDP_API_KEY_SECRET` (cuenta gratuita en portal.cdp.coinbase.com) — variables nuevas en `render.yaml`, pendientes de que el usuario las genere y las pegue en Render.

`AUTOMATON_ALLOW_MAINNET` sigue en `false` en `render.yaml` hasta terminar de validar el facilitator de CDP en testnet primero (ver el plan de verificación del momento en que se activó).
