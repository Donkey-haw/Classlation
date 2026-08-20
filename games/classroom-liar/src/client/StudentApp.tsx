import { useEffect, useMemo, useState } from "react";
import type { PublicMember, StudentSnapshot } from "../shared/types";
import { Brand, ConnectionBadge } from "./components/Brand";
import { Notice, Waiting } from "./components/Notice";
import { emitWithAck, socket } from "./socket";

const STUDENT_SESSION_KEY = "classroom-liar-student";

const TEAM_IDENTITIES = [
  { symbol: "⚡", name: "번개", tone: "blue" },
  { symbol: "✦", name: "별", tone: "violet" },
  { symbol: "●", name: "태양", tone: "orange" },
  { symbol: "◆", name: "보석", tone: "green" },
  { symbol: "≈", name: "파도", tone: "cyan" },
  { symbol: "▲", name: "산", tone: "coral" },
  { symbol: "☾", name: "달", tone: "indigo" },
  { symbol: "✥", name: "나침반", tone: "mint" },
  { symbol: "■", name: "네모", tone: "gold" },
  { symbol: "✿", name: "꽃", tone: "rose" },
] as const;

interface StudentSession {
  roomCode: string;
  playerId: string;
  resumeToken: string;
}

interface RejoinApproved extends StudentSession {
  snapshot: StudentSnapshot;
}

function saveStudentSession(session: StudentSession) {
  localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(session));
  sessionStorage.removeItem(STUDENT_SESSION_KEY);
}

function clearStudentSession() {
  localStorage.removeItem(STUDENT_SESSION_KEY);
  sessionStorage.removeItem(STUDENT_SESSION_KEY);
}

function getTeamIdentity(teamName?: string) {
  const teamNumber = Number.parseInt(teamName ?? "", 10);
  return TEAM_IDENTITIES[(Number.isNaN(teamNumber) ? 1 : teamNumber) - 1] ?? TEAM_IDENTITIES[0]!;
}

function TeamSetupCard({ snapshot }: { snapshot: StudentSnapshot }) {
  const teamName = snapshot.teamName ?? "팀";
  const identity = getTeamIdentity(snapshot.teamName);
  const isNextRound = snapshot.roundNumber > 1;

  return (
    <section className="student-card student-card--center team-setup-card">
      <span className="eyebrow">{isNextRound ? `${snapshot.roundNumber}라운드 새 팀` : "게임 시작 전 자리 이동"}</span>
      <p className="team-label">내 팀은</p>
      <div className={`team-number team-number--${identity.tone}`} aria-label={`${identity.name} ${teamName}`}>
        <span aria-hidden="true">{identity.symbol}</span>
        <strong>{teamName}</strong>
        <small>{identity.name} 팀</small>
      </div>
      <h1>{identity.name} {teamName}입니다</h1>
      <p>아래 팀원들을 찾아 같은 자리에 모이세요.</p>
      <div className="student-team-members" aria-label="같은 팀 학생">
        {snapshot.members.map((member) => (
          <span key={member.id} className={member.id === snapshot.playerId ? "is-me" : ""}>
            {member.name}{member.id === snapshot.playerId ? " · 나" : ""}
          </span>
        ))}
      </div>
      <p className="privacy-note">누를 버튼은 없습니다. 선생님이 모두 모인 것을 확인하면 {isNextRound ? "다음 라운드가" : "게임이"} 시작됩니다.</p>
    </section>
  );
}

function DiscussionCard({ onStart, busy }: { onStart: () => void; busy: boolean }) {
  return (
    <section className="student-card student-card--center discussion-card">
      <span className="eyebrow">대면 대화</span>
      <div className="put-down-icon" aria-hidden="true">↓</div>
      <h1>이제 기기를 내려놓으세요</h1>
      <p>팀원들의 얼굴을 보고 자유롭게 단서와 질문을 주고받으세요.</p>
      <ol className="conversation-rules">
        <li>한 사람씩 돌아가며 주제어에 관한 단서를 말해요.</li>
        <li>서로 질문하고 답하며 라이어를 찾아요.</li>
      </ol>
      <div className="discussion-vote-gate">
        <strong>대화가 끝났나요?</strong>
        <p>팀원 한 명만 눌러도 모두의 화면이 바뀝니다.</p>
        <button className="button button--outline button--large" onClick={onStart} disabled={busy}>팀 투표 시작</button>
      </div>
    </section>
  );
}

function RoleCard({ snapshot, busy, onConfirm }: { snapshot: StudentSnapshot; busy: boolean; onConfirm: () => void }) {
  const isLiar = snapshot.role === "liar";

  return (
    <section className={`student-card role-card ${isLiar ? "role-card--liar" : "role-card--member"}`}>
      <span className="role-privacy"><span aria-hidden="true">◉</span> 나만 보는 비밀 카드</span>
      <div className="role-symbol" aria-hidden="true">{isLiar ? "?" : "✓"}</div>
      <p className="role-label">당신은</p>
      <h1>{isLiar ? "라이어입니다" : "팀원입니다"}</h1>
      <div className="secret-box">
        <small>{isLiar ? "주제 범주" : "비밀 주제어"}</small>
        <strong>{isLiar ? snapshot.category : snapshot.topic}</strong>
        {snapshot.explanation && <p>{snapshot.explanation}</p>}
      </div>
      <button className="button button--primary button--large" onClick={onConfirm} disabled={busy || snapshot.confirmed}>확인했어요</button>
      <p className="privacy-note">다른 사람에게 화면을 보이지 마세요. 모두 확인하면 대화 안내로 넘어갑니다.</p>
    </section>
  );
}

function ResultCard({ snapshot }: { snapshot: StudentSnapshot }) {
  const isLiarWin = snapshot.winner === "liar";
  const isDetectiveWin = snapshot.winner === "detectives";
  const title = isLiarWin ? "라이어 탈출!" : isDetectiveWin ? "수사팀 성공!" : "정답 공개!";
  const symbolClass = isLiarWin ? "liar" : isDetectiveWin ? "detectives" : "answer";
  const symbol = isLiarWin ? "!" : isDetectiveWin ? "✓" : "정답";
  const showAccused = Boolean(snapshot.accusedName && snapshot.accusedName !== snapshot.liarName);

  return (
    <section className="student-card student-card--center result-card">
      <span className="eyebrow">라운드 결과</span>
      <div className={`result-symbol result-symbol--${symbolClass}`}>{symbol}</div>
      <h1>{title}</h1>
      <p>{snapshot.winner ? "팀원들과 결과를 확인하고 다음 라운드를 기다리세요." : "방금 말한 추측과 실제 주제어를 팀원들과 비교하세요."}</p>
      <div className="result-grid">
        <span className={showAccused ? undefined : "result-item--solo"}><small>진짜 라이어</small><strong>{snapshot.liarName}</strong></span>
        {showAccused && <span><small>지목한 사람</small><strong>{snapshot.accusedName}</strong></span>}
        <span className="result-item--topic"><small>실제 주제어</small><strong>{snapshot.topic}</strong></span>
      </div>
    </section>
  );
}

function VoteCard({
  snapshot,
  event,
  busy,
  onAction,
}: {
  snapshot: StudentSnapshot;
  event: "student:vote" | "student:runoff-vote";
  busy: boolean;
  onAction: (event: string, payload?: Record<string, unknown>) => void;
}) {
  const runoffIds = new Set(snapshot.runoffCandidates ?? []);
  const candidates = snapshot.members.filter((member) =>
    member.id !== snapshot.playerId && (event === "student:vote" || runoffIds.has(member.id)),
  );

  if (snapshot.voteSubmitted) {
    return <Waiting title="투표를 받았어요" detail="다른 팀원의 익명 투표를 기다리고 있습니다." />;
  }

  return (
    <section className="student-card">
      <span className="eyebrow">{event === "student:vote" ? "익명 투표" : "결선 익명 투표"}</span>
      <h1>라이어라고 생각하는<br />한 명을 고르세요</h1>
      <p>선택 내용은 다른 학생에게 보이지 않습니다.</p>
      <div className="vote-list">
        {candidates.map((member, index) => (
          <button key={member.id} type="button" onClick={() => onAction(event, { targetId: member.id })} disabled={busy}>
            <span>{index + 1}</span><strong>{member.name}</strong><i>선택</i>
          </button>
        ))}
      </div>
    </section>
  );
}

function StudentHeader({ snapshot, connected }: { snapshot: StudentSnapshot; connected: boolean }) {
  return (
    <>
      <header className="student-topbar">
        <Brand compact />
        <div className="student-identity"><span>{snapshot.playerName}</span><ConnectionBadge connected={connected} /></div>
      </header>
      {(snapshot.status === "playing" || (snapshot.status === "teamSetup" && snapshot.roundNumber > 0)) && (
        <div className="student-meta"><span>{snapshot.teamName}</span><span>{snapshot.roundNumber} / {snapshot.roundCount} 라운드</span></div>
      )}
    </>
  );
}

export function StudentApp() {
  const roomFromUrl = useMemo(() => new URLSearchParams(window.location.search).get("room") ?? "", []);
  const [roomCode, setRoomCode] = useState(roomFromUrl);
  const [name, setName] = useState("");
  const [session, setSession] = useState<StudentSession>();
  const [snapshot, setSnapshot] = useState<StudentSnapshot>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const [canRequestRejoin, setCanRequestRejoin] = useState(false);
  const [rejoinPending, setRejoinPending] = useState(false);

  useEffect(() => {
    const connect = () => setConnected(true);
    const disconnect = () => setConnected(false);
    const update = (value: StudentSnapshot) => setSnapshot(value);
    const rejoinApproved = (value: RejoinApproved) => {
      const nextSession = { roomCode: value.roomCode, playerId: value.playerId, resumeToken: value.resumeToken };
      saveStudentSession(nextSession);
      setSession(nextSession);
      setSnapshot(value.snapshot);
      setRejoinPending(false);
      setCanRequestRejoin(false);
      setError("");
    };
    const rejoinRejected = (message: string) => {
      setRejoinPending(false);
      setCanRequestRejoin(true);
      setError(message);
    };
    socket.on("connect", connect);
    socket.on("disconnect", disconnect);
    socket.on("student:snapshot", update);
    socket.on("student:rejoin-approved", rejoinApproved);
    socket.on("student:rejoin-rejected", rejoinRejected);
    setConnected(socket.connected);
    return () => {
      socket.off("connect", connect);
      socket.off("disconnect", disconnect);
      socket.off("student:snapshot", update);
      socket.off("student:rejoin-approved", rejoinApproved);
      socket.off("student:rejoin-rejected", rejoinRejected);
    };
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(STUDENT_SESSION_KEY) ?? sessionStorage.getItem(STUDENT_SESSION_KEY);
    if (!raw || !connected) return;
    try {
      const saved = JSON.parse(raw) as StudentSession;
      if (roomFromUrl && saved.roomCode !== roomFromUrl) return;
      emitWithAck<StudentSnapshot>("student:resume", saved)
        .then((value) => { saveStudentSession(saved); setSession(saved); setSnapshot(value); })
        .catch(() => clearStudentSession());
    } catch {
      clearStudentSession();
    }
  }, [connected, roomFromUrl]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.scrollTo(0, 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [snapshot?.phase, snapshot?.status]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try { await action(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function join() {
    setBusy(true);
    setError("");
    setCanRequestRejoin(false);
    try {
      const joined = await emitWithAck<{ playerId: string; resumeToken: string; snapshot: StudentSnapshot }>("student:join", { roomCode, name });
      const nextSession = { roomCode, playerId: joined.playerId, resumeToken: joined.resumeToken };
      saveStudentSession(nextSession);
      setSession(nextSession);
      setSnapshot(joined.snapshot);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다.";
      setError(message);
      setCanRequestRejoin(message.includes("입장이 마감된 방입니다"));
    } finally {
      setBusy(false);
    }
  }

  async function requestRejoin() {
    await run(async () => {
      await emitWithAck<{ requestId: string }>("student:request-rejoin", { roomCode, name });
      setRejoinPending(true);
      setCanRequestRejoin(false);
    });
  }

  async function action(event: string, payload: Record<string, unknown> = {}) {
    await run(() => emitWithAck(event, payload));
  }

  if (!session || !snapshot) {
    if (rejoinPending) {
      return (
        <main className="student-shell student-shell--join">
          <header className="student-topbar"><Brand compact /><ConnectionBadge connected={connected} /></header>
          <Waiting title="재입장 요청을 보냈어요" detail="선생님이 기존 참가자와 확인하면 원래 팀과 진행 단계로 돌아갑니다." />
        </main>
      );
    }
    return (
      <main className="student-shell student-shell--join">
        <header className="student-topbar"><Brand compact /><ConnectionBadge connected={connected} /></header>
        <section className="join-card">
          <span className="eyebrow">클래스 라이어</span>
          <h1>게임방에<br />들어오세요</h1>
          <p>선생님 화면의 방 코드와 사용할 별명을 입력하세요.</p>
          <Notice message={error} onClose={() => setError("")} />
          <label>방 코드<input value={roomCode} onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" /></label>
          <label>별명<input value={name} onChange={(event) => setName(event.target.value)} maxLength={12} autoComplete="off" /></label>
          <button className="button button--primary button--large" type="button" onClick={join} disabled={busy || roomCode.length !== 6 || !name.trim()}>입장하기</button>
          {canRequestRejoin && <button className="button button--outline button--large rejoin-button" type="button" onClick={requestRejoin} disabled={busy}>기존 참가자로 재입장 요청</button>}
        </section>
      </main>
    );
  }

  let content;
  if (snapshot.status === "ended" || snapshot.phase === "ended") {
    content = <section className="student-card student-card--center"><div className="result-symbol result-symbol--answer">✓</div><h1>함께해서 즐거웠어요!</h1><p>게임이 종료되었습니다. 기기를 내려놓고 팀원들과 마무리하세요.</p></section>;
  } else if (snapshot.status === "lobby") {
    content = <Waiting title="입장 완료!" detail="잠시 후 내 팀이 먼저 표시됩니다. 팀을 확인한 뒤 자리로 이동하세요." />;
  } else if (snapshot.phase === "teamSetup") {
    content = <TeamSetupCard snapshot={snapshot} />;
  } else if (snapshot.phase === "secret") {
    content = <RoleCard snapshot={snapshot} busy={busy} onConfirm={() => action("student:confirm")} />;
  } else if (snapshot.phase === "discussion") {
    content = <DiscussionCard onStart={() => action("student:start-vote")} busy={busy} />;
  } else if (snapshot.phase === "vote") {
    content = <VoteCard snapshot={snapshot} event="student:vote" busy={busy} onAction={action} />;
  } else if (snapshot.phase === "runoffDiscussion") {
    const candidateNames = snapshot.members.filter((member: PublicMember) => snapshot.runoffCandidates?.includes(member.id));
    content = (
      <section className="student-card student-card--center discussion-card">
        <span className="eyebrow">결선 대화</span>
        <div className="put-down-icon" aria-hidden="true">↓</div>
        <h1>다시 기기를 내려놓으세요</h1>
        <p>동점 후보를 중심으로 짧게 더 이야기하세요.</p>
        <div className="candidate-strip">{candidateNames.map((member) => <span key={member.id}>{member.name}</span>)}</div>
        <div className="discussion-vote-gate">
          <strong>짧은 대화가 끝났나요?</strong>
          <p>팀원 한 명만 눌러도 모두의 화면이 바뀝니다.</p>
          <button className="button button--outline button--large" onClick={() => action("student:start-runoff-vote")} disabled={busy}>팀 결선 투표 시작</button>
        </div>
      </section>
    );
  } else if (snapshot.phase === "runoffVote") {
    content = <VoteCard snapshot={snapshot} event="student:runoff-vote" busy={busy} onAction={action} />;
  } else if (snapshot.phase === "finalGuess") {
    content = snapshot.role === "liar" ? (
      <section className="student-card student-card--center">
        <span className="eyebrow">마지막 기회</span>
        <div className="role-symbol">?</div>
        <h1>주제어를 말로<br />추측하세요</h1>
        <p>팀원에게 최종 추측을 소리 내어 말한 뒤 정답을 공개하세요.</p>
        <button className="button button--primary button--large" onClick={() => action("student:reveal-answer")} disabled={busy}>말했어요·정답 공개</button>
      </section>
    ) : <Waiting title="라이어의 추측을 들어 주세요" detail="라이어가 주제어를 말하면 곧 정답이 공개됩니다." />;
  } else if (snapshot.phase === "reveal") {
    content = <ResultCard snapshot={snapshot} />;
  } else {
    content = <Waiting title="다음 안내를 기다려 주세요" detail="선생님 화면에서 현재 상태를 확인하고 있습니다." />;
  }

  return (
    <main className="student-shell">
      <StudentHeader snapshot={snapshot} connected={connected} />
      <Notice message={error} onClose={() => setError("")} />
      {content}
    </main>
  );
}
