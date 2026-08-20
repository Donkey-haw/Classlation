import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:4173";
const outputDir = resolve(process.env.E2E_OUTPUT_DIR || "/tmp/classroom-liar-resilient-e2e");
mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

function watch(page, label) {
  page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label}: ${message.text()}`);
  });
}

async function teamName(page) {
  return (await page.locator(".student-meta span").first().textContent())?.trim();
}

async function teamSizes(teacher) {
  return teacher.locator(".team-card").evaluateAll((cards) =>
    cards.map((card) => card.querySelectorAll(".team-editor-member").length).sort((a, b) => a - b),
  );
}

try {
  const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const teacher = await teacherContext.newPage();
  watch(teacher, "teacher");
  await teacher.goto(baseUrl, { waitUntil: "networkidle" });
  await teacher.getByLabel("팀 권장 인원 3~32명").fill("10");
  await teacher.getByRole("combobox").nth(0).selectOption("2");
  await teacher.getByRole("combobox").nth(1).selectOption("rotate");
  await teacher.getByRole("button", { name: "방 만들기" }).click();
  const roomCodeElement = teacher.locator(".room-code");
  await roomCodeElement.waitFor();
  const roomCode = (await roomCodeElement.textContent()).trim();

  const students = [];
  for (let index = 0; index < 10; index += 1) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const name = `학생${index + 1}`;
    watch(page, name);
    await page.goto(`${baseUrl}/join?room=${roomCode}`, { waitUntil: "networkidle" });
    await page.getByLabel("별명").fill(name);
    await page.getByRole("button", { name: "입장하기" }).click();
    await page.getByRole("heading", { name: "입장 완료!" }).waitFor();
    students.push({ context, page, name });
  }

  await teacher.locator(".participant-list span").nth(9).waitFor();
  await teacher.getByRole("button", { name: "입장 마감·팀 배정" }).click();
  await Promise.all(students.map(({ page }) => page.getByRole("heading", { name: /팀입니다/ }).waitFor()));
  await teacher.getByRole("heading", { name: "팀끼리 모여 앉으세요" }).waitFor();
  if (JSON.stringify(await teamSizes(teacher)) !== JSON.stringify([10])) {
    throw new Error("권장 인원 10명으로 한 팀을 만들지 못했습니다.");
  }

  // 브라우저가 종료돼도 로컬 저장소가 남아 있으면 교사 승인 없이 자동 복귀한다.
  const autoResumeStudent = students[9];
  const savedBrowserStorage = await autoResumeStudent.context.storageState();
  await autoResumeStudent.context.close();
  const autoResumeContext = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: savedBrowserStorage });
  const autoResumePage = await autoResumeContext.newPage();
  watch(autoResumePage, `${autoResumeStudent.name}-auto-resume`);
  await autoResumePage.goto(`${baseUrl}/join?room=${roomCode}`, { waitUntil: "networkidle" });
  await autoResumePage.getByRole("heading", { name: /팀입니다/ }).waitFor();
  autoResumeStudent.context = autoResumeContext;
  autoResumeStudent.page = autoResumePage;

  // 큰 팀에서 빈 팀 추가/삭제와 학생 이동을 실제로 수행한다.
  await teacher.getByRole("button", { name: "팀 추가" }).click();
  await teacher.getByRole("button", { name: "빈 팀 제거" }).click();
  await teacher.getByRole("button", { name: "팀 추가" }).click();
  for (const student of students.slice(0, 3)) {
    await teacher.getByLabel(`${student.name} 팀 변경`).selectOption({ label: "2팀" });
  }
  await teacher.getByRole("button", { name: "팀 추가" }).click();
  for (const student of students.slice(3, 6)) {
    await teacher.getByLabel(`${student.name} 팀 변경`).selectOption({ label: "3팀" });
  }
  const editedSizes = await teamSizes(teacher);
  if (JSON.stringify(editedSizes) !== JSON.stringify([3, 3, 4])) {
    throw new Error(`교사 팀 편집 결과가 예상과 다릅니다: ${editedSizes.join(",")}`);
  }
  await teacher.screenshot({ path: join(outputDir, "teacher-team-editor.png"), fullPage: true });
  await students[3].page.screenshot({ path: join(outputDir, "student-edited-team.png"), fullPage: true });

  // 저장 정보가 완전히 사라진 상황은 교사가 기존 참가자를 지정해 승인한다.
  const rejoining = students[0];
  await rejoining.context.close();
  const rejoinContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const rejoinPage = await rejoinContext.newPage();
  watch(rejoinPage, `${rejoining.name}-approved-rejoin`);
  await rejoinPage.goto(`${baseUrl}/join?room=${roomCode}`, { waitUntil: "networkidle" });
  await rejoinPage.getByLabel("별명").fill(rejoining.name);
  await rejoinPage.getByRole("button", { name: "입장하기" }).click();
  await rejoinPage.getByRole("alert").getByText("입장이 마감된 방입니다.").waitFor();
  await rejoinPage.getByRole("button", { name: "기존 참가자로 재입장 요청" }).click();
  await rejoinPage.getByRole("heading", { name: "재입장 요청을 보냈어요" }).waitFor();
  await teacher.getByText("재입장 요청", { exact: true }).waitFor();
  const selectedPlayer = await teacher.getByLabel(`${rejoining.name} 기존 참가자 선택`).inputValue();
  if (!selectedPlayer) throw new Error("재입장 요청에 연결할 기존 참가자가 선택되지 않았습니다.");
  await teacher.screenshot({ path: join(outputDir, "teacher-rejoin-request.png"), fullPage: true });
  await teacher.getByRole("button", { name: "승인", exact: true }).click();
  await rejoinPage.getByRole("heading", { name: /팀입니다/ }).waitFor();
  rejoining.context = rejoinContext;
  rejoining.page = rejoinPage;

  await teacher.getByRole("button", { name: "자리 이동 완료·게임 시작" }).click();
  await Promise.all(students.map(({ page }) => page.getByText("당신은").waitFor()));
  const firstRoundTeams = new Map();
  for (const student of students) firstRoundTeams.set(student.name, await teamName(student.page));
  const liarByTeam = new Map();
  for (const student of students) {
    if (await student.page.getByRole("heading", { name: "라이어입니다" }).count()) {
      liarByTeam.set(await teamName(student.page), student.name);
    }
  }
  for (const { page } of students) await page.getByRole("button", { name: "확인했어요" }).click();
  await Promise.all(students.map(({ page }) => page.getByRole("heading", { name: "이제 기기를 내려놓으세요" }).waitFor()));

  const groups = new Map();
  for (const student of students) {
    const name = await teamName(student.page);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(student);
  }

  for (const group of groups.values()) {
    await group[0].page.getByRole("button", { name: "팀 투표 시작" }).click();
    await Promise.all(group.map(({ page }) => page.getByRole("heading", { name: /라이어라고 생각하는/ }).waitFor()));
    const currentTeam = await teamName(group[0].page);
    const liarStudent = group.find((student) => student.name === liarByTeam.get(currentTeam));
    if (!liarStudent) throw new Error("팀의 라이어를 찾지 못했습니다.");
    const citizen = group.find((student) => student !== liarStudent);
    for (const student of group) {
      const target = student === liarStudent ? citizen : liarStudent;
      await student.page.locator(".vote-list button", { hasText: target.name }).click();
    }
    await liarStudent.page.getByRole("heading", { name: /주제어를 말로/ }).waitFor();
    await liarStudent.page.getByRole("button", { name: "말했어요·정답 공개" }).click();
  }
  await Promise.all(students.map(({ page }) => page.getByRole("heading", { name: /정답 공개|라이어 탈출|수사팀 성공/ }).waitFor()));
  await teacher.getByRole("button", { name: "다음 라운드 팀 배정" }).click();
  await teacher.getByRole("heading", { name: "새 팀으로 이동하세요" }).waitFor();
  await Promise.all(students.map(({ page }) => page.getByText("2 / 2 라운드").waitFor()));

  const rotatedSizes = await teamSizes(teacher);
  if (JSON.stringify(rotatedSizes) !== JSON.stringify([3, 3, 4])) {
    throw new Error(`라운드 재편성에서 팀 수나 크기가 보존되지 않았습니다: ${rotatedSizes.join(",")}`);
  }
  let changedTeamCount = 0;
  for (const student of students) {
    if ((await teamName(student.page)) !== firstRoundTeams.get(student.name)) changedTeamCount += 1;
  }
  if (changedTeamCount === 0) throw new Error("라운드가 바뀌었지만 이동한 학생이 없습니다.");
  await teacher.screenshot({ path: join(outputDir, "teacher-round-two-teams.png"), fullPage: true });
  await students[0].page.screenshot({ path: join(outputDir, "student-round-two-team.png"), fullPage: true });

  await teacher.getByRole("button", { name: "자리 이동 완료·2라운드 시작" }).click();
  await Promise.all(students.map(({ page }) => page.getByText("당신은").waitFor()));
  await teacher.getByRole("button", { name: "게임 종료" }).click();
  await Promise.all(students.map(({ page }) => page.getByRole("heading", { name: "함께해서 즐거웠어요!" }).waitFor()));

  const teacherState = await teacher.evaluate(() => window.render_game_to_text());
  writeFileSync(join(outputDir, "states.json"), JSON.stringify({ roomCode, editedSizes, rotatedSizes, changedTeamCount, teacherState }, null, 2));
  writeFileSync(join(outputDir, "console-errors.json"), JSON.stringify(errors, null, 2));
  if (errors.length) throw new Error(`브라우저 콘솔 오류 ${errors.length}건: ${errors.join(" | ")}`);

  for (const { context } of students) await context.close();
  await teacherContext.close();
  console.log(`Resilient teams E2E passed for room ${roomCode}; changed=${changedTeamCount}; artifacts=${outputDir}`);
} finally {
  await browser.close();
}
