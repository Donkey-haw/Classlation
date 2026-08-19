import { useEffect, useMemo, useState } from "react";
import type { PublicMember, StudentSnapshot } from "../shared/types";
import { Brand, ConnectionBadge } from "./components/Brand";
import { Notice, Waiting } from "./components/Notice";
import { emitWithAck, socket } from "./socket";

const STUDENT_SESSION_KEY = "classroom-liar-student";

interface StudentSession {
  roomCode: string;
  playerId: string;
  resumeToken: string;
}

function TeamSetupCard({ snapshot }: { snapshot: StudentSnapshot }) {
  return (
    <section className="student-card student-card--center team-setup-card">
      <span className="eyebrow">게임 시작 전 자리 이동</span>
      <p className="team-label">내 팀은</p>
      <div className="team-number">{snapshot.teamName}</div>
      <h1>{snapshot.teamName}입니다</h1>
      <p>아래 팀원들을 찾아 같은 자리에 모이세요.</p>
      <div className="student-team-members" aria-label="같은 팀 학생">
        {snapshot.members.map((member) => (
          <span key={member.id} className={member.id === snapshot.playerId ? "is-me" : ""}>
            {member.name}{member.id === snapshot.playerId ? " · 나" : ""}
          </span>
        ))}
      </div>
      <p className="privacy-note">누를 버튼은 없습니다. 선생님이 모두 모인 것을 확인하면 게임이 시작됩니다.</p>
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
        <li>충분히 이야기했다면 팀원 한 명만 아래 버튼을 눌러요.</li>
      </ol>
      <button className="button button--primary button--large" onClick={onStart} disabled={busy}>팀 투표 시작</button>
      <p className="privacy-note">팀원 모두의 화면이 동시에 투표 화면으로 바뀝니다.</p>
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
      {snapshot.status === "playing" && (
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

  useEffect(() => {
    const connect = () => setConnected(true);
    const disconnect = () => setConnected(false);
    const update = (value: StudentSnapshot) => setSnapshot(value);
    socket.on("connect", connect);
    socket.on("disconnect", disconnect);
    socket.on("student:snapshot", update);
    setConnected(socket.connected);
    return () => {
      socket.off("connect", connect);
      socket.off("disconnect", disconnect);
      socket.off("student:snapshot", update);
    };
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem(STUDENT_SESSION_KEY);
    if (!raw || !connected) return;
    try {
      const saved = JSON.parse(raw) as StudentSession;
      emitWithAck<StudentSnapshot>("student:resume", saved)
        .then((value) => { setSession(saved); setSnapshot(value); })
        .catch(() => sessionStorage.removeItem(STUDENT_SESSION_KEY));
    } catch {
      sessionStorage.removeItem(STUDENT_SESSION_KEY);
    }
  }, [connected]);

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
    await run(async () => {
      const joined = await emitWithAck<{ playerId: string; resumeToken: string; snapshot: StudentSnapshot }>("student:join", { roomCode, name });
      const nextSession = { roomCode, playerId: joined.playerId, resumeToken: joined.resumeToken };
      sessionStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      setSnapshot(joined.snapshot);
    });
  }

  async function action(event: string, payload: Record<string, unknown> = {}) {
    await run(() => emitWithAck(event, payload));
  }

  if (!session || !snapshot) {
    return (
      <main className="student-shell student-shell--join">
        <header className="student-topbar"><Brand compact /><ConnectionBadge connected={connected} /></header>
        <section className="join-card">
          <span className="eyebrow">교실 라이어</span>
          <h1>게임방에<br />들어오세요</h1>
          <p>선생님 화면의 방 코드와 사용할 별명을 입력하세요.</p>
          <Notice message={error} onClose={() => setError("")} />
          <label>방 코드<input value={roomCode} onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" /></label>
          <label>별명<input value={name} onChange={(event) => setName(event.target.value)} maxLength={12} autoComplete="off" /></label>
          <button className="button button--primary button--large" type="button" onClick={join} disabled={busy || roomCode.length !== 6 || !name.trim()}>입장하기</button>
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
    content = (
      <section className={`student-card role-card ${snapshot.role === "liar" ? "role-card--liar" : ""}`}>
        <div className="role-symbol">{snapshot.role === "liar" ? "?" : "✓"}</div>
        <p className="role-label">당신은</p>
        <h1>{snapshot.role === "liar" ? "라이어입니다" : "팀원입니다"}</h1>
        <div className="secret-box">
          <small>{snapshot.role === "liar" ? "주제 범주" : "비밀 주제어"}</small>
          <strong>{snapshot.role === "liar" ? snapshot.category : snapshot.topic}</strong>
          {snapshot.explanation && <p>{snapshot.explanation}</p>}
        </div>
        <button className="button button--primary button--large" onClick={() => action("student:confirm")} disabled={busy || snapshot.confirmed}>확인했어요</button>
        <p className="privacy-note">다른 사람에게 화면을 보이지 마세요. 모두 확인하면 대화 안내로 넘어갑니다.</p>
      </section>
    );
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
        <button className="button button--primary button--large" onClick={() => action("student:start-runoff-vote")} disabled={busy}>팀 결선 투표 시작</button>
        <p className="privacy-note">충분히 이야기했다면 팀원 한 명만 누르세요.</p>
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
    const title = snapshot.winner === "liar" ? "라이어 탈출!" : snapshot.winner === "detectives" ? "수사팀 성공!" : "정답을 확인하세요";
    const symbolClass = snapshot.winner === "liar" ? "liar" : snapshot.winner === "detectives" ? "detectives" : "answer";
    content = (
      <section className="student-card student-card--center">
        <span className="eyebrow">라운드 결과</span>
        <div className={`result-symbol result-symbol--${symbolClass}`}>{snapshot.winner === "liar" ? "!" : "✓"}</div>
        <h1>{title}</h1>
        <p>{snapshot.winner ? "팀원들과 결과를 확인하고 다음 라운드를 기다리세요." : "방금 말한 추측과 실제 주제어를 팀원들과 비교하세요."}</p>
        <div className="result-grid">
          {snapshot.accusedName && <span><small>지목된 사람</small><strong>{snapshot.accusedName}</strong></span>}
          <span><small>라이어</small><strong>{snapshot.liarName}</strong></span>
          <span><small>실제 주제어</small><strong>{snapshot.topic}</strong></span>
        </div>
      </section>
    );
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
