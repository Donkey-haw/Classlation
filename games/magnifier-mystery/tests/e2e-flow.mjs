import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";
import { chromium } from "playwright";

const port = 4181;
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
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByTestId("image-0").setInputFiles({ name: "ball.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="blue"/><circle cx="400" cy="300" r="150" fill="white"/></svg>') });
  await page.getByTestId("answer-0").fill("축구공");
  await page.getByTestId("start-game").click();
  await page.getByTestId("game-screen").waitFor();
  await page.getByText("초성 힌트", { exact: true }).last().click();
  await page.getByTestId("chosung").waitFor();
  await page.getByTestId("reveal").click();
  await page.getByTestId("revealed").waitFor();
  await page.getByTestId("next-question").click();
  await page.getByTestId("result-screen").waitFor();
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text?.()));
  assert.equal(state.screen, "result");
  await browser.close();
  console.log("magnifier-mystery e2e: ok");
} finally {
  server.kill("SIGTERM");
}
