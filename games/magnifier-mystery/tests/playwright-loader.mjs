import { pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";
import { realpathSync } from "node:fs";

const playwrightUrl = pathToFileURL(realpathSync(resolvePath(process.cwd(), "tests/playwright-system.mjs"))).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "playwright") return { url: playwrightUrl, shortCircuit: true };
  return nextResolve(specifier, context);
}
