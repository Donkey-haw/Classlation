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
  let state = JSON.parse(await page.evaluate(() => window.render_game_to_text?.()));
  assert.equal(state.topicCount, 30);
  assert.deepEqual(state.categories, ["직업"]);

  await page.getByTestId("open-topic-picker").click();
  await page.getByTestId("category-animals").click();
  await page.getByTestId("select-category").click();
  assert.match(await page.getByTestId("selected-topic-count").innerText(), /44개/);
  await page.getByTestId("category-jobs").click();
  await page.getByTestId("clear-category").click();
  await page.getByTestId("category-animals").click();
  await page.locator('[data-testid^="topic-animals-"]').first().click();
  assert.match(await page.getByTestId("selected-topic-count").innerText(), /13개/);
  if (process.env.QA_PICKER_SCREENSHOT) await page.screenshot({ path: process.env.QA_PICKER_SCREENSHOT });
  await page.getByTestId("category-custom").click();
  await page.getByTestId("custom-category-name").fill("과학");
  await page.getByTestId("custom-topics").fill("광합성 | 🌱 | 햇빛을 받아 자라는 모습\n화산 폭발 | 🌋 | 땅이 흔들리는 모습");
  assert.match(await page.getByTestId("selected-topic-count").innerText(), /15개/);
  if (process.env.QA_CUSTOM_SCREENSHOT) await page.screenshot({ path: process.env.QA_CUSTOM_SCREENSHOT });
  await page.getByTestId("apply-topics").click();

  state = JSON.parse(await page.evaluate(() => window.render_game_to_text?.()));
  assert.equal(state.topicCount, 15);
  assert.deepEqual(state.categories, ["동물", "과학"]);
  await page.getByTestId("draw").click();
  await page.getByTestId("drawn-topic-1").waitFor();
  await page.getByTestId("drawn-topic-2").waitFor();
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text?.()));
  assert.equal(state.pairVisible, true);
  assert.equal(state.remainingTopics, 13);
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
