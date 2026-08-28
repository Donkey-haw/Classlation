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
  const blueImage = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#2456d8"/><circle cx="400" cy="300" r="150" fill="white"/></svg>');
  const greenImage = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#1b8b5a"/><path d="M0 500 L400 120 L800 500" fill="#b8e6c9"/></svg>');
  await page.getByTestId("batch-images").setInputFiles([
    { name: "강아지.svg", mimeType: "image/svg+xml", buffer: blueImage },
    { name: "여름.바다.svg", mimeType: "image/svg+xml", buffer: greenImage },
  ]);
  await page.getByTestId("question-card-1").waitFor();
  assert.equal(await page.locator('[data-testid^="question-card-"]').count(), 2);
  assert.equal(await page.getByTestId("answer-0").inputValue(), "강아지");
  assert.equal(await page.getByTestId("answer-1").inputValue(), "여름.바다");

  await page.evaluate(() => {
    const transfer = new DataTransfer();
    document.querySelector('[data-testid="image-drop-zone"]')?.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  assert.ok(await page.getByTestId("image-drop-zone").evaluate((element) => element.classList.contains("is-dragging")));
  await page.evaluate(() => {
    const data = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#e3a526"/><circle cx="400" cy="240" r="120" fill="#fff4c4"/></svg>';
    const transfer = new DataTransfer();
    transfer.items.add(new File([data], "산 정상.svg", { type: "image/svg+xml" }));
    document.querySelector('[data-testid="image-drop-zone"]')?.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await page.getByTestId("question-card-2").waitFor();
  assert.equal(await page.getByTestId("answer-2").inputValue(), "산 정상");
  assert.equal(JSON.parse(await page.evaluate(() => window.render_game_to_text?.())).questionCount, 3);
  if (process.env.QA_SETUP_SCREENSHOT) await page.screenshot({ path: process.env.QA_SETUP_SCREENSHOT });

  await page.getByTestId("answer-0").fill("Apple 2호점");
  await page.getByTestId("start-game").click();
  await page.getByTestId("game-screen").waitFor();
  const lensBox = await page.locator("canvas").boundingBox();
  assert.ok(lensBox, "magnifier canvas should be visible");
  assert.ok(Math.abs(lensBox.width - lensBox.height) < 1, `magnifier should be circular, received ${lensBox.width}x${lensBox.height}`);
  if (process.env.QA_SCREENSHOT) await page.screenshot({ path: process.env.QA_SCREENSHOT });
  await page.getByText("초성 힌트", { exact: true }).last().click();
  await page.getByTestId("chosung").waitFor();
  const hintText = await page.getByTestId("chosung").innerText();
  assert.match(hintText, /••••• •ㅎㅈ/);
  assert.doesNotMatch(hintText, /Apple|2/);
  if (process.env.QA_HINT_SCREENSHOT) await page.screenshot({ path: process.env.QA_HINT_SCREENSHOT });
  await page.getByTestId("reveal").click();
  await page.getByTestId("revealed").waitFor();
  await page.getByTestId("next-question").click();
  await page.getByTestId("reveal").click();
  await page.getByTestId("next-question").click();
  await page.getByTestId("reveal").click();
  await page.getByTestId("next-question").click();
  await page.getByTestId("result-screen").waitFor();
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text?.()));
  assert.equal(state.screen, "result");
  await browser.close();
  console.log("magnifier-mystery e2e: ok");
} finally {
  server.kill("SIGTERM");
}
