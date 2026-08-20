import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { PublicMember, RejoinRequest, TeacherSnapshot, TeamPhase, TeamProgress, TopicInput } from "../shared/types";
import { Brand, ConnectionBadge } from "./components/Brand";
import { Notice } from "./components/Notice";
import { emitWithAck, socket } from "./socket";

const TEACHER_SESSION_KEY = "classroom-liar-teacher";
const phaseLabels: Record<TeamPhase, string> = {
  lobby: "대기실", teamSetup: "팀 이동", secret: "역할 확인", discussion: "대면 대화",
  vote: "비밀 투표", runoffDiscussion: "결선 대화", runoffVote: "결선 투표",
  finalGuess: "라이어 추리", reveal: "결과 공개", ended: "종료",
};
const progressPhases = new Set<TeamPhase>(["secret", "vote", "runoffVote"]);

interface TeacherSession { roomCode: string; teacherToken: string }

function phaseDetail(team: TeamProgress): string {
  if (team.phase === "teamSetup") return `${team.members.length}명 · 같은 팀끼리 이동 중`;
  if (team.phase === "secret") return `${team.completed} / ${team.total}명 확인`;
  if (team.phase === "discussion") return "기기를 내려놓고 대화 중";
  if (team.phase === "vote") return `${team.completed} / ${team.total}명 투표`;
  if (team.phase === "runoffDiscussion") return "동점 후보와 추가 대화 중";
  if (team.phase === "runoffVote") return `${team.completed} / ${team.total}명 결선 투표`;
  if (team.phase === "finalGuess") return "라이어가 말로 주제어 추리 중";
  if (team.phase === "reveal") return "라운드 완료";
  return phaseLabels[team.phase];
}

function TeamCard({
  team,
  teams,
  busy,
  editable,
  onAdvance,
  onMove,
  onRemove,
}: {
  team: TeamProgress;
  teams: TeamProgress[];
  busy: boolean;
  editable: boolean;
  onAdvance: (teamId: string) => void;
  onMove: (playerId: string, teamId: string) => void;
  onRemove: (teamId: string) => void;
}) {
  const showProgress = progressPhases.has(team.phase);
  return (
    <article className={`team-card team-card--${team.phase}`}>
      <div className="team-card__top"><strong>{team.name}</strong><span className={`phase phase--${team.phase}`}>{phaseLabels[team.phase]}</span></div>
      {editable ? (
        <div className="team-editor-members" aria-label={`${team.name} 팀원 편집`}>
          {team.members.length === 0 && <p className="empty">학생을 이 팀으로 옮겨 주세요.</p>}
          {team.members.map((member) => (
            <div className="team-editor-member" key={member.id}>
              <span className={!member.connected ? "offline" : ""}>{member.name}</span>
              <select aria-label={`${member.name} 팀 변경`} value={team.id} onChange={(event) => onMove(member.id, event.target.value)} disabled={busy}>
                {teams.map((target) => <option value={target.id} key={target.id}>{target.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      ) : (
        <div className="team-members" aria-label={`${team.name} 팀원`}>
          {team.members.map((member) => <span key={member.id} className={!member.connected ? "offline" : ""}>{member.name}</span>)}
        </div>
      )}
      {showProgress && <div className="progress-track"><span style={{ width: `${Math.max(4, (team.completed / Math.max(1, team.total)) * 100)}%` }} /></div>}
      <div className="team-card__meta"><span>{phaseDetail(team)}</span></div>
      {editable && team.members.length === 0 && <button className="button button--small button--quiet" onClick={() => onRemove(team.id)} disabled={busy}>빈 팀 제거</button>}
      {(team.phase === "discussion" || team.phase === "runoffDiscussion") && (
        <button className="button button--small button--quiet" onClick={() => onAdvance(team.id)} disabled={busy}>{team.phase === "discussion" ? "이 팀 투표 시작" : "이 팀 결선 투표 시작"}</button>
      )}
    </article>
  );
}

function RejoinRequestCard({
  request,
  offlinePlayers,
  busy,
  onApprove,
  onReject,
}: {
  request: RejoinRequest;
  offlinePlayers: PublicMember[];
  busy: boolean;
  onApprove: (requestId: string, playerId: string) => void;
  onReject: (requestId: string) => void;
}) {
  const exactMatch = offlinePlayers.find((player) => player.name === request.name);
  const [playerId, setPlayerId] = useState(exactMatch?.id ?? offlinePlayers[0]?.id ?? "");

  useEffect(() => {
    if (!offlinePlayers.some((player) => player.id === playerId)) {
      setPlayerId(exactMatch?.id ?? offlinePlayers[0]?.id ?? "");
    }
  }, [exactMatch?.id, offlinePlayers, playerId]);

  return (
    <div className="rejoin-request">
      <strong>{request.name}</strong>
      <span>이 이름으로 재입장을 요청했습니다.</span>
      <select aria-label={`${request.name} 기존 참가자 선택`} value={playerId} onChange={(event) => setPlayerId(event.target.value)} disabled={busy || offlinePlayers.length === 0}>
        {offlinePlayers.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}
      </select>
      <div className="rejoin-request__actions">
        <button className="button button--small button--primary" onClick={() => onApprove(request.id, playerId)} disabled={busy || !playerId}>승인</button>
        <button className="button button--small button--quiet" onClick={() => onReject(request.id)} disabled={busy}>거절</button>
      </div>
    </div>
  );
}

export function TeacherApp() {
  const [category, setCategory] = useState("음식");
  const [topicText, setTopicText] = useState("김치찌개\n된장찌개\n떡볶이\n비빔밥\n불고기");
  const [preferredTeamSize, setPreferredTeamSize] = useState(5);
  const [roundCount, setRoundCount] = useState(3);
  const [teamMode, setTeamMode] = useState<"fixed" | "rotate">("fixed");
  const [session, setSession] = useState<TeacherSession>();
  const [snapshot, setSnapshot] = useState<TeacherSnapshot>();
  const [joinUrl, setJoinUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const connect = () => setConnected(true);
    const disconnect = () => setConnected(false);
    const update = (value: TeacherSnapshot) => setSnapshot(value);
    socket.on("connect", connect); socket.on("disconnect", disconnect); socket.on("teacher:snapshot", update);
    setConnected(socket.connected);
    return () => { socket.off("connect", connect); socket.off("disconnect", disconnect); socket.off("teacher:snapshot", update); };
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem(TEACHER_SESSION_KEY);
    if (!raw || !connected) return;
    try {
      const saved = JSON.parse(raw) as TeacherSession;
      emitWithAck<TeacherSnapshot>("teacher:resume", saved).then((value) => { setSession(saved); setSnapshot(value); }).catch(() => sessionStorage.removeItem(TEACHER_SESSION_KEY));
    } catch { sessionStorage.removeItem(TEACHER_SESSION_KEY); }
  }, [connected]);

  useEffect(() => {
    if (!snapshot) return;
    fetch("/api/local-ip").then((response) => response.json()).then(({ address }: { address?: string }) => {
      const host = address || window.location.hostname;
      const port = window.location.port ? `:${window.location.port}` : "";
      setJoinUrl(`${window.location.protocol}//${host}${port}/join?room=${snapshot.roomCode}`);
    }).catch(() => setJoinUrl(`${window.location.origin}/join?room=${snapshot.roomCode}`));
  }, [snapshot?.roomCode]);

  const topics = useMemo<TopicInput[]>(() => topicText.split("\n").map((word) => ({ word: word.trim() })).filter((topic) => topic.word), [topicText]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function createRoom() {
    await run(async () => {
      const created = await emitWithAck<{ roomCode: string; teacherToken: string; snapshot: TeacherSnapshot }>("teacher:create", { category, topics, preferredTeamSize, roundCount, teamMode });
      const nextSession = { roomCode: created.roomCode, teacherToken: created.teacherToken };
      sessionStorage.setItem(TEACHER_SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession); setSnapshot(created.snapshot);
    });
  }

  async function action(event: string, payload: Record<string, unknown> = {}) { await run(() => emitWithAck(event, payload)); }
  function resetRoom() { sessionStorage.removeItem(TEACHER_SESSION_KEY); setSession(undefined); setSnapshot(undefined); }

  if (!snapshot || !session) {
    return (
      <main className="teacher-shell">
        <header className="topbar"><Brand /><ConnectionBadge connected={connected} /></header>
        <div className="teacher-grid teacher-grid--setup">
          <section className="hero-panel">
            <span className="eyebrow">대면 우선 협업 게임</span><h1>필요한 순간에만<br />화면을 사용하세요.</h1>
            <p>앱은 팀과 비밀 정보를 정리합니다. 단서와 질문은 학생들이 얼굴을 보고 직접 나눕니다.</p>
            <ol className="rule-list"><li><span>1</span>게임 전에 팀을 확인하고 이동</li><li><span>2</span>역할 확인 뒤 기기를 내려놓고 대화</li><li><span>3</span>마지막에만 기기를 들어 비밀 투표</li></ol>
          </section>
          <section className="setup-panel">
            <div className="section-heading"><span className="eyebrow">새 게임</span><h2>수업에 맞게 준비하세요</h2></div>
            <Notice message={error} onClose={() => setError("")} />
            <label>주제 범주<input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={30} /></label>
            <label>주제어 <small>한 줄에 하나씩</small><textarea value={topicText} onChange={(event) => setTopicText(event.target.value)} rows={7} /></label>
            <div className="field-row"><label>팀 권장 인원 <small>3~32명</small><input type="number" min={3} max={32} value={preferredTeamSize} onChange={(event) => setPreferredTeamSize(Number(event.target.value))} /></label><label>라운드<select value={roundCount} onChange={(event) => setRoundCount(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}라운드</option>)}</select></label></div>
            <label>라운드별 팀 구성<select value={teamMode} onChange={(event) => setTeamMode(event.target.value as "fixed" | "rotate")}><option value="fixed">게임 내내 같은 팀</option><option value="rotate">라운드마다 새 팀</option></select></label>
            <button className="button button--primary button--large" type="button" onClick={createRoom} disabled={busy || preferredTeamSize < 3 || preferredTeamSize > 32}>방 만들기</button>
            <p className="form-help">방을 만든 뒤 학생에게 QR 코드 또는 접속 주소를 보여 주세요.</p>
          </section>
        </div>
      </main>
    );
  }

  const allRevealed = snapshot.teams.length > 0 && snapshot.teams.every((team) => team.phase === "reveal");
  const canAssign = snapshot.status === "lobby" && snapshot.participants.length >= 3;
  const offlinePlayers = snapshot.participants.filter((player) => !player.connected);
  const teamsValid = snapshot.teams.length > 0 && snapshot.teams.every((team) => team.members.length >= 3);
  const canAddTeam = snapshot.teams.length < Math.floor(snapshot.participants.length / 3);
  const isNextRoundSetup = snapshot.status === "teamSetup" && snapshot.roundNumber > 1;
  const heading = snapshot.status === "lobby" ? { eyebrow: "입장 대기", title: "모두 들어오면 팀을 나누세요" }
    : snapshot.status === "teamSetup" ? { eyebrow: isNextRoundSetup ? `${snapshot.roundNumber}라운드 준비` : "자리 이동", title: isNextRoundSetup ? "새 팀으로 이동하세요" : "팀끼리 모여 앉으세요" }
      : { eyebrow: `${snapshot.roundNumber} / ${snapshot.roundCount} 라운드`, title: "팀별 진행 상황" };

  return (
    <main className="teacher-shell">
      <header className="topbar"><Brand /><div className="topbar__actions"><ConnectionBadge connected={connected} /><span className="shortcut">F 전체 화면</span></div></header>
      <Notice message={error} onClose={() => setError("")} />
      <div className="teacher-grid teacher-grid--room">
        <aside className="room-panel">
          <span className="eyebrow">{snapshot.status === "lobby" ? "학생 입장" : "입장 마감"}</span><p className="room-code-label">방 코드</p>
          <div className="room-code" aria-label={`방 코드 ${snapshot.roomCode}`}>{snapshot.roomCode}</div>
          {snapshot.status === "lobby" && joinUrl && <div className="qr-wrap"><QRCodeSVG value={joinUrl} size={168} level="M" /><span>카메라로 스캔</span></div>}
          {snapshot.status === "lobby" ? <p className="join-url">{joinUrl}</p> : <div className="entry-locked">새 입장은 마감되었습니다. 기존 학생은 재입장을 요청할 수 있습니다.</div>}
          <div className="participant-heading"><strong>참가자</strong><span>{snapshot.participants.length}명</span></div>
          <div className="participant-list">{snapshot.participants.length === 0 && <p className="empty">아직 들어온 학생이 없습니다.</p>}{snapshot.participants.map((player) => <span key={player.id} className={!player.connected ? "offline" : ""}>{player.name}</span>)}</div>
          {snapshot.status === "lobby" && <button className="button button--primary button--large" type="button" disabled={!canAssign || busy} onClick={() => action("teacher:assign-teams")}>입장 마감·팀 배정</button>}
          {snapshot.status === "lobby" && snapshot.participants.length < 3 && <p className="form-help">3명 이상 들어오면 팀을 나눌 수 있어요.</p>}
          {snapshot.rejoinRequests.length > 0 && <div className="rejoin-panel"><div className="participant-heading"><strong>재입장 요청</strong><span>{snapshot.rejoinRequests.length}건</span></div>{snapshot.rejoinRequests.map((request) => <RejoinRequestCard key={request.id} request={request} offlinePlayers={offlinePlayers} busy={busy} onApprove={(requestId, playerId) => action("teacher:approve-rejoin", { requestId, playerId })} onReject={(requestId) => action("teacher:reject-rejoin", { requestId })} />)}</div>}
        </aside>
        <section className="progress-panel">
          <div className="progress-header">
            <div><span className="eyebrow">{heading.eyebrow}</span><h1>{heading.title}</h1></div>
            {snapshot.status === "teamSetup" && <button className="button button--primary" onClick={() => action("teacher:start")} disabled={busy || !teamsValid}>자리 이동 완료·{isNextRoundSetup ? `${snapshot.roundNumber}라운드 시작` : "게임 시작"}</button>}
            {snapshot.status === "playing" && <div className="round-actions">{allRevealed && snapshot.roundNumber < snapshot.roundCount && <button className="button button--primary" onClick={() => action("teacher:next-round")} disabled={busy}>{snapshot.teamMode === "rotate" ? "다음 라운드 팀 배정" : "다음 라운드"}</button>}<button className="button button--quiet" onClick={() => action("teacher:end")} disabled={busy}>게임 종료</button></div>}
          </div>
          {snapshot.status === "lobby" ? <div className="teacher-waiting"><div className="waiting-illustration">?</div><h2>학생들이 입장하고 있어요</h2><p>입장이 끝나면 먼저 팀을 배정합니다.</p></div> : <><div className="teacher-instruction"><strong>{snapshot.status === "teamSetup" ? "아직 비밀 역할은 공개되지 않았습니다." : "대화는 학생들이 직접 진행합니다."}</strong><span>{snapshot.status === "teamSetup" ? "학생을 옮겨 팀을 조정한 뒤, 실제 자리 이동을 확인하고 시작하세요." : "앱은 비밀 확인과 투표 상태만 보여 줍니다."}</span></div>{snapshot.status === "teamSetup" && <><div className="team-edit-toolbar"><div><strong>팀 구성 조정</strong><span>학생별 선택 메뉴로 팀을 바꿀 수 있습니다.</span></div><div><button className="button button--quiet" onClick={() => action("teacher:reshuffle-teams")} disabled={busy}>자동 다시 섞기</button><button className="button button--outline" onClick={() => action("teacher:add-team")} disabled={busy || !canAddTeam}>팀 추가</button></div></div>{!teamsValid && <div className="team-validation">모든 팀에 학생을 3명 이상 배정해야 시작할 수 있습니다.</div>}</>}<div className="team-grid">{snapshot.teams.map((team) => <TeamCard key={team.id} team={team} teams={snapshot.teams} busy={busy} editable={snapshot.status === "teamSetup"} onAdvance={(teamId) => action("teacher:advance-discussion", { teamId })} onMove={(playerId, teamId) => action("teacher:move-player", { playerId, teamId })} onRemove={(teamId) => action("teacher:remove-team", { teamId })} />)}</div></>}
          {snapshot.status === "ended" && <div className="end-banner"><strong>게임을 종료했습니다.</strong><button className="button button--quiet" onClick={resetRoom}>새 방 만들기</button></div>}
        </section>
      </div>
    </main>
  );
}
