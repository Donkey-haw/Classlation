import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:4173";
const outputDir = resolve(process.env.E2E_OUTPUT_DIR || "/tmp/classroom-liar-e2e");
mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

function watch(page, label) {
  page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label}: ${message.text()}`);
  });
}

try {
  const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const teacher = await teacherContext.newPage();
  watch(teacher, "teacher");
  await teacher.goto(baseUrl, { waitUntil: "networkidle" });
  await teacher.getByRole("button", { name: "방 만들기" }).click();
  const roomCodeElement = teacher.locator(".room-code");
  await roomCodeElement.waitFor();
  const roomCode = (await roomCodeElement.textContent()).trim();

  const studentRecords = [];
  for (let index = 0; index < 5; index += 1) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    watch(page, `student-${index + 1}`);
    await page.goto(`${baseUrl}/join?room=${roomCode}`, { waitUntil: "networkidle" });
    await page.getByLabel("별명").fill(`학생${index + 1}`);
    await page.getByRole("button", { name: "입장하기" }).click();
    await page.getByRole("heading", { name: "입장 완료!" }).waitFor();
    studentRecords.push({ context, page, name: `학생${index + 1}` });
  }

  await teacher.getByText("5명", { exact: true }).waitFor();
  await teacher.getByRole("button", { name: "입장 마감·팀 배정" }).click();
  await Promise.all(studentRecords.map(({ page }) => page.getByRole("heading", { name: /팀입니다/ }).waitFor()));
  await teacher.getByRole("heading", { name: "팀끼리 모여 앉으세요" }).waitFor();
  await teacher.screenshot({ path: join(outputDir, "teacher-team-setup.png"), fullPage: true });
  await studentRecords[0].page.screenshot({ path: join(outputDir, "student-team-assignment.png"), fullPage: true });

  for (const { page } of studentRecords) {
    if (await page.locator(".secret-box").count()) throw new Error("자리 이동 단계에서 비밀 역할이 노출되었습니다.");
  }

  const lateContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const lateStudent = await lateContext.newPage();
  watch(lateStudent, "late-student");
  await lateStudent.goto(`${baseUrl}/join?room=${roomCode}`, { waitUntil: "networkidle" });
  await lateStudent.getByLabel("별명").fill("늦은학생");
  await lateStudent.getByRole("button", { name: "입장하기" }).click();
  await lateStudent.getByRole("alert").getByText("입장이 마감된 방입니다.").waitFor();
  await lateContext.close();

  await teacher.reload({ waitUntil: "networkidle" });
  await teacher.getByRole("heading", { name: "팀끼리 모여 앉으세요" }).waitFor();
  await teacher.getByRole("button", { name: "자리 이동 완료·게임 시작" }).click();
  await Promise.all(studentRecords.map(({ page }) => page.getByText("당신은").waitFor()));

  let liarIndex = -1;
  let topic = "";
  for (let index = 0; index < studentRecords.length; index += 1) {
    const page = studentRecords[index].page;
    if (await page.getByRole("heading", { name: "라이어입니다" }).count()) liarIndex = index;
    else if (!topic) topic = (await page.locator(".secret-box strong").textContent()).trim();
  }
  if (liarIndex < 0 || !topic) throw new Error("역할 또는 주제어를 확인하지 못했습니다.");

  const reconnectIndex = studentRecords.findIndex((_, index) => index !== liarIndex);
  await studentRecords[reconnectIndex].page.reload({ waitUntil: "networkidle" });
  await studentRecords[reconnectIndex].page.getByRole("heading", { name: "팀원입니다" }).waitFor();
  const restoredTopic = (await studentRecords[reconnectIndex].page.locator(".secret-box strong").textContent()).trim();
  if (restoredTopic !== topic) throw new Error("재접속 후 주제어가 복구되지 않았습니다.");

  for (const { page } of studentRecords) await page.getByRole("button", { name: "확인했어요" }).click();
  await Promise.all(studentRecords.map(({ page }) => page.getByRole("heading", { name: "이제 기기를 내려놓으세요" }).waitFor()));

  for (const { page } of studentRecords) {
    if (await page.getByRole("button", { name: "발언을 마쳤어요" }).count()) throw new Error("개인 발언 완료 버튼이 남아 있습니다.");
    if (await page.getByRole("button", { name: "질문과 답변을 마쳤어요" }).count()) throw new Error("개인 질문 완료 버튼이 남아 있습니다.");
  }
  await studentRecords[0].page.screenshot({ path: join(outputDir, "student-face-to-face-discussion.png"), fullPage: true });
  await teacher.screenshot({ path: join(outputDir, "teacher-discussion.png"), fullPage: true });

  await studentRecords[0].page.getByRole("button", { name: "팀 투표 시작" }).click();
  await Promise.all(studentRecords.map(({ page }) => page.getByRole("heading", { name: /라이어라고 생각하는/ }).waitFor()));

  const liarName = studentRecords[liarIndex].name;
  const citizenName = studentRecords.find((_, index) => index !== liarIndex).name;
  for (let index = 0; index < studentRecords.length; index += 1) {
    const targetName = index === liarIndex ? citizenName : liarName;
    await studentRecords[index].page.locator(".vote-list button", { hasText: targetName }).click();
  }

  const liarPage = studentRecords[liarIndex].page;
  await liarPage.getByRole("heading", { name: /주제어를 말로/ }).waitFor();
  if (await liarPage.getByLabel("최종 정답").count()) throw new Error("온라인 정답 입력란이 남아 있습니다.");
  await liarPage.getByRole("button", { name: "말했어요·정답 공개" }).click();
  await liarPage.getByRole("heading", { name: "정답을 확인하세요" }).waitFor();
  await liarPage.screenshot({ path: join(outputDir, "student-result.png"), fullPage: true });
  await teacher.getByText("결과 공개").waitFor();
  await teacher.screenshot({ path: join(outputDir, "teacher-result.png"), fullPage: true });

  const teacherState = await teacher.evaluate(() => window.render_game_to_text());
  const studentState = await liarPage.evaluate(() => window.render_game_to_text());
  writeFileSync(join(outputDir, "states.json"), JSON.stringify({ roomCode, liarName, topic, teacherState, studentState }, null, 2));
  writeFileSync(join(outputDir, "console-errors.json"), JSON.stringify(errors, null, 2));
  if (errors.length) throw new Error(`브라우저 콘솔 오류 ${errors.length}건: ${errors.join(" | ")}`);

  await teacher.getByRole("button", { name: "게임 종료" }).click();
  await Promise.all(studentRecords.map(({ page }) => page.getByRole("heading", { name: "함께해서 즐거웠어요!" }).waitFor()));

  for (const { context } of studentRecords) await context.close();
  await teacherContext.close();
  console.log(`E2E flow passed for room ${roomCode}; liar=${liarName}; topic=${topic}; artifacts=${outputDir}`);
} finally {
  await browser.close();
}
