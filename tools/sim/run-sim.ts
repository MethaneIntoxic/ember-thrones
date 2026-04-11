import { runSpinSimulation } from "@ember-thrones/shared";

function parseArg(name: string, fallback: number): number {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!found) {
    return fallback;
  }

  const raw = Number(found.split("=")[1]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

const spins = parseArg("spins", 200000);
const bet = parseArg("bet", 20);
const seed = parseArg("seed", 42);

const report = runSpinSimulation({
  totalSpins: spins,
  bet,
  seed,
  profile: "medium",
});

console.log(JSON.stringify(report, null, 2));
