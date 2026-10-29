import { productionConfigProblems } from "../src/lib/providers/assert-env.ts";

const problems = productionConfigProblems(process.env);
if (problems.length > 0) {
  const names = problems.map((item) => `${item.name} ${item.problem}`).join(", ");
  console.error(`[config] ${names}`);
}
