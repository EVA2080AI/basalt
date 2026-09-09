# Wallets de Basalt

Registro de las identidades on-chain del proyecto. Solo direcciones públicas —
**ninguna clave privada vive en este archivo ni en este repo, nunca.**

## Activas (Base Sepolia — testnet, dinero de prueba)

| Entorno | Dirección | Dónde vive la clave | Explorer |
|---|---|---|---|
| Local (tu máquina) | `0x8815b8fa6EA6d08d80F03ef638A132A75eE4fF9c` | `~/.automaton/wallet.base-sepolia.json` (sin cifrar — solo aceptable en testnet) | [ver en BaseScan](https://sepolia.basescan.org/address/0x8815b8fa6EA6d08d80F03ef638A132A75eE4fF9c) |
| Producción (Render) | `0x6781e796A48a22a487914b98836Fd57199dfBFC3` | Generada por el propio contenedor al arrancar (no hay `AUTOMATON_PRIVATE_KEY` configurada — ver §"Por qué dos wallets distintas") | [ver en BaseScan](https://sepolia.basescan.org/address/0x6781e796A48a22a487914b98836Fd57199dfBFC3) |

Ambas se fondean igual: **https://faucet.circle.com**, red **Base Sepolia**, pegar la dirección.

Estado al momento de escribir esto (verificado directo on-chain, no solo en el faucet): **0 USDC en ambas todavía** — si ya pediste fondos y no aparecen aquí, puede ser que el faucet aún no confirme, o que se haya fondeado una dirección distinta a estas dos exactas.

## Por qué dos wallets distintas (y no la misma)

El disco de un contenedor en Render no es persistente entre despliegues — si generáramos la wallet ahí y guardáramos la clave en un archivo local como en tu máquina, cada redeploy perdería el acceso a los fondos. La alternativa correcta es una variable de entorno `AUTOMATON_PRIVATE_KEY` inyectada como secreto de la plataforma. Se intentó así, pero copiar y pegar la clave a mano falló varias veces (una vez con formato inválido, otra vez porque el archivo local terminó sobrescrito con un valor incorrecto — ver historial abajo). Se optó por dejar que cada entorno tenga su propia identidad generada localmente, evitando mover una clave privada entre sistemas.

Esto es intencional y aceptable en testnet. Si más adelante se quiere una sola identidad compartida entre local y producción, hay que repetir el proceso de `AUTOMATON_PRIVATE_KEY` con más cuidado, o mover a un servicio de custodia real.

## Wallet abandonada (histórico, no usar)

`0x6DA2663C0e800D21d7e7923732A696cfa7CD3460` — la primera wallet de testnet del proyecto, la que hizo los primeros pagos x402 reales (ver commits de Fase 1 y 2). Su clave privada quedó sobrescrita por error en `~/.automaton/wallet.base-sepolia.json` durante el proceso de configurar Render (se pegó ahí, por accidente, un valor generado por Render en vez de copiar en la dirección contraria). Como es testnet, la pérdida es cero en términos reales — quedan ~17 USDC de prueba inaccesibles en esa dirección, nada más. Copia del archivo dañado conservada en `~/.automaton/wallet.base-sepolia.corrupted.json.bak` por si acaso, pero no se espera poder recuperar la clave.

Lección aplicada: `src/wallet/wallet.ts` ahora sanea (espacios, comillas, prefijo `0x`) cualquier valor que llegue por `AUTOMATON_PRIVATE_KEY` antes de usarlo, y separa los archivos de wallet por red — pero ninguna validación de código evita que un humano edite el archivo equivocado a mano. Tratar `~/.automaton/wallet.*.json` como se trataría cualquier archivo de claves: no abrirlo para "probar cosas", solo para leer el valor de `privateKey` cuando haga falta.

## Cuando llegue el momento de mainnet

Ninguna de las direcciones de arriba sirve para eso — `AUTOMATON_ALLOW_MAINNET=true` exige una wallet nueva, y el código (`src/wallet/wallet.ts`) rechaza crearla sin `AUTOMATON_WALLET_PASSPHRASE`. Ese es un paso aparte, deliberado, que no se da por accidente.
