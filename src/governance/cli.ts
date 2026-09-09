import { listPending, decide } from "./approvals.js";

const [cmd, arg] = process.argv.slice(2);

function main() {
  if (cmd === "pending") {
    const pending = listPending();
    if (pending.length === 0) {
      console.log("No hay aprobaciones pendientes.");
      return;
    }
    for (const p of pending) {
      console.log(`[${p.id}] $${p.amountUsd} USD → ${p.counterparty} (${p.toolId}, ${p.network})`);
      console.log(`      motivo: ${p.reason}`);
      console.log(`      npm run governance:approve -- ${p.id}   |   npm run governance:reject -- ${p.id}`);
    }
    return;
  }

  if (cmd === "approve" || cmd === "reject") {
    if (!arg) {
      console.log(`Uso: npm run governance:${cmd} -- <id>`);
      return;
    }
    const record = decide(arg, cmd === "approve");
    if (!record) {
      console.log(`No existe ninguna aprobación pendiente con id '${arg}'.`);
      return;
    }
    console.log(`[${record.id}] ahora está: ${record.status}`);
    return;
  }

  console.log("Uso: tsx src/governance/cli.ts <pending|approve|reject> [id]");
}

main();
