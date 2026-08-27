import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";
import { chromium } from "playwright";

const port = 4182;
const server = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
const waitForServer = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("server did not start");
};

try {
  await waitForServer();
  const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByTestId("draw").click();
  await page.getByTestId("drawn-topic-1").waitFor();
  await page.getByTestId("drawn-topic-2").waitFor();
  let state = JSON.parse(await page.evaluate(() => window.render_game_to_text?.()));
  assert.equal(state.pairVisible, true);
  assert.equal(state.remainingTopics, 28);
  await page.getByTestId("start-round").click();
  await page.evaluate(() => window.advanceTime?.(1000));
  await page.getByTestId("correct-1").click();
  await page.getByTestId("wrong-2").click();
  await page.getByTestId("finish-round").click();
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text?.()));
  assert.equal(state.phase, "initial");
  assert.deepEqual(state.scores, [1, 0]);
  await browser.close();
  console.log("classroom-charades e2e: ok");
} finally {
  server.kill("SIGTERM");
}
