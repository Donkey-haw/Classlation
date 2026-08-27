import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_TOPICS } from "../content/defaultTopics";
import { drawPair, redrawPair, type Pair, type Topic } from "../domain/game";
import { TopicPicker } from "./TopicPicker";
import { useFullscreenShortcut } from "./useFullscreen";

type Phase = "initial" | "drawn" | "playing" | "empty";
type Result = "correct" | "wrong" | null;
type History = { id: number; team: string; topic: string; emoji: string; result: Exclude<Result, null> };

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (milliseconds: number) => void;
  }
}

function playTone(kind: "start" | "correct" | "wrong", enabled: boolean) {
  if (!enabled) return;
  try {
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.type = kind === "wrong" ? "sawtooth" : "sine";
    oscillator.frequency.setValueAtTime(kind === "wrong" ? 190 : 523, audio.currentTime);
    oscillator.frequency.setValueAtTime(kind === "correct" ? 1046 : kind === "start" ? 784 : 145, audio.currentTime + .16);
    gain.gain.setValueAtTime(.13, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .32);
    oscillator.start();
    oscillator.stop(audio.currentTime + .34);
    window.setTimeout(() => void audio.close(), 600);
  } catch { /* Audio is optional. */ }
}

export function App() {
  useFullscreenShortcut();
  const [topics, setTopics] = useState<Topic[]>(DEFAULT_TOPICS);
  const [pool, setPool] = useState<Topic[]>(DEFAULT_TOPICS);
  const [pair, setPair] = useState<Pair | null>(null);
  const [phase, setPhase] = useState<Phase>("initial");
  const [teamNames, setTeamNames] = useState<[string, string]>(["청팀", "홍팀"]);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [results, setResults] = useState<[Result, Result]>([null, null]);
  const [peek, setPeek] = useState<[boolean, boolean]>([false, false]);
  const [timerDuration, setTimerDuration] = useState(60);
  const [remainingSeconds, setRemainingSeconds] = useState(60);
  const [expired, setExpired] = useState(false);
  const [history, setHistory] = useState<History[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const advanceSeconds = useCallback((seconds: number) => {
    if (phase !== "playing" || timerDuration === 0 || expired) return;
    setRemainingSeconds((current) => {
      const next = Math.max(0, current - seconds);
      if (next === 0) setExpired(true);
      return next;
    });
  }, [phase, timerDuration, expired]);

  useEffect(() => {
    if (phase !== "playing" || timerDuration === 0 || expired) return;
    const timer = window.setInterval(() => advanceSeconds(1), 1000);
    return () => window.clearInterval(timer);
  }, [phase, timerDuration, expired, advanceSeconds]);

  useEffect(() => {
    if (expired) playTone("wrong", soundEnabled);
  }, [expired, soundEnabled]);

  const choosePair = () => {
    const drawn = pair && phase === "drawn" ? redrawPair(pool, pair) : drawPair(pool);
    if (!drawn.pair) { setPhase("empty"); return; }
    setPair(drawn.pair);
    setPool(drawn.remaining);
    setResults([null, null]);
    setPeek([false, false]);
    setExpired(false);
    setPhase("drawn");
  };

  const startRound = () => {
    if (!pair) return;
    setRemainingSeconds(timerDuration);
    setExpired(false);
    setPeek([false, false]);
    setPhase("playing");
    playTone("start", soundEnabled);
  };

  const recordResult = (teamIndex: 0 | 1, result: Exclude<Result, null>) => {
    if (!pair || results[teamIndex]) return;
    setResults((current) => teamIndex === 0 ? [result, current[1]] : [current[0], result]);
    if (result === "correct") setScores((current) => teamIndex === 0 ? [current[0] + 1, current[1]] : [current[0], current[1] + 1]);
    setHistory((items) => [{ id: Date.now() + teamIndex, team: teamNames[teamIndex], topic: pair[teamIndex].word, emoji: pair[teamIndex].emoji, result }, ...items]);
    playTone(result, soundEnabled);
  };

  const finishRound = () => {
    setPair(null);
    setResults([null, null]);
    setPeek([false, false]);
    setExpired(false);
    setPhase(pool.length < 2 ? "empty" : "initial");
  };

  const resetGame = (nextTopics = topics) => {
    setTopics(nextTopics);
    setPool(nextTopics);
    setPair(null);
    setPhase("initial");
    setScores([0, 0]);
    setResults([null, null]);
    setPeek([false, false]);
    setRemainingSeconds(timerDuration);
    setExpired(false);
    setHistory([]);
  };

  const applyTopics = (nextTopics: Topic[]) => {
    resetGame(nextTopics);
    setPickerOpen(false);
    setNotice(`${nextTopics.length}개 주제로 새 게임을 준비했어요.`);
  };

  const selectedCategories = useMemo(() => Array.from(new Set(topics.map((topic) => topic.category))), [topics]);

  const textState = useMemo(() => ({
    app: "classroom-charades", phase, topicCount: topics.length, remainingTopics: pool.length,
    categories: selectedCategories, pairVisible: phase === "drawn", scores, results,
    remainingSeconds: timerDuration === 0 ? null : remainingSeconds, expired,
  }), [phase, topics.length, pool.length, selectedCategories, scores, results, timerDuration, remainingSeconds, expired]);

  useEffect(() => {
    window.render_game_to_text = () => JSON.stringify(textState);
    window.advanceTime = (milliseconds) => advanceSeconds(Math.floor(milliseconds / 1000));
    return () => { delete window.render_game_to_text; delete window.advanceTime; };
  }, [textState, advanceSeconds]);

  const setTeamName = (index: 0 | 1, value: string) => setTeamNames((current) => index === 0 ? [value, current[1]] : [current[0], value]);
  const adjustScore = (index: 0 | 1, delta: number) => setScores((current) => index === 0 ? [Math.max(0, current[0] + delta), current[1]] : [current[0], Math.max(0, current[1] + delta)]);
  const bothRecorded = results[0] !== null && results[1] !== null;

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span>🎭</span><div>몸으로 말해요<small>두 팀 동시 진행 · 교실 TV 화면</small></div></div><div className="header-actions"><button className="button ghost" onClick={() => setSoundEnabled((value) => !value)}>{soundEnabled ? "🔊 소리 켬" : "🔇 음소거"}</button><button className="button ghost" onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()}>전체 화면 <kbd>F</kbd></button><button className="button ghost" data-testid="open-topic-picker" onClick={() => setPickerOpen(true)}>주제 선택</button><button className="button danger-ghost" onClick={() => { if (window.confirm("점수와 기록을 모두 지우고 새로 시작할까요?")) resetGame(); }}>초기화</button></div></header>

    <main className="game-layout">
      {notice && <button className="notice" onClick={() => setNotice("")}>{notice}<span>닫기</span></button>}
      <section className="scoreboard">
        {[0, 1].map((index) => <article className={`team-score team-${index + 1}`} key={index}>
          <input aria-label={`${index + 1}팀 이름`} value={teamNames[index]} onChange={(event) => setTeamName(index as 0 | 1, event.target.value)} />
          <strong data-testid={`score-${index + 1}`}>{scores[index]}</strong><span>점</span>
          <div><button onClick={() => adjustScore(index as 0 | 1, -1)}>−</button><button onClick={() => adjustScore(index as 0 | 1, 1)}>+</button></div>
        </article>)}
        <div className="round-meta"><label>제한 시간<select value={timerDuration} onChange={(event) => setTimerDuration(Number(event.target.value))} disabled={phase === "playing"}><option value={30}>30초</option><option value={60}>60초</option><option value={90}>90초</option><option value={0}>제한 없음</option></select></label><span>남은 주제 <strong>{pool.length}</strong>개</span><span className="category-summary" title={selectedCategories.join(", ")}>{selectedCategories.join(" · ")}</span></div>
      </section>

      <section className="stage" data-testid={`phase-${phase}`}>
        {phase === "initial" && <div className="empty-state"><span className="stage-icon">🎲</span><h1>두 팀의 주제를 뽑아 주세요</h1><p>두 주제가 화면에 동시에 공개됩니다. 각 팀은 자기 주제를 확인해요.</p><div className="selected-summary"><strong>선택한 주제 {topics.length}개</strong><span>{selectedCategories.join(" · ")}</span></div></div>}

        {phase === "drawn" && pair && <div className="drawn-state"><div className="instruction"><span>준비</span><strong>두 팀이 각자의 주제를 확인하세요</strong></div><div className="topic-grid">{pair.map((topic, index) => <article className={`topic-card team-${index + 1}`} data-testid={`drawn-topic-${index + 1}`} key={topic.id}><small>{teamNames[index]}</small><span>{topic.emoji}</span><h2>{topic.word}</h2>{topic.hint && <p>힌트 · {topic.hint}</p>}</article>)}</div><p className="simultaneous-note">상대 팀 주제가 보여도 괜찮아요. 두 팀은 서로 다른 주제로 동시에 진행합니다.</p></div>}

        {phase === "playing" && pair && <div className="playing-state"><div className={`timer ${expired ? "expired" : ""}`}>{timerDuration === 0 ? <><small>제한 시간</small><strong>∞</strong></> : <><small>{expired ? "시간 종료" : "남은 시간"}</small><strong>{remainingSeconds}</strong><span>초</span></>}</div><div className="play-grid">{pair.map((topic, index) => <article className={`play-card team-${index + 1} ${results[index] ? `is-${results[index]}` : ""}`} key={topic.id}><small>{teamNames[index]}</small><div className="hidden-word">{peek[index] ? <strong>{topic.emoji} {topic.word}</strong> : <><span>몸으로 표현 중</span><button onClick={() => setPeek((current) => index === 0 ? [!current[0], current[1]] : [current[0], !current[1]])}>{teamNames[index]} 주제 {peek[index] ? "숨기기" : "다시 보기"}</button></>}</div>{results[index] ? <div className="recorded">{results[index] === "correct" ? "정답 기록 완료" : "오답 기록 완료"}</div> : <div className="result-buttons"><button data-testid={`correct-${index + 1}`} onClick={() => recordResult(index as 0 | 1, "correct")}>⭕ 정답</button><button data-testid={`wrong-${index + 1}`} onClick={() => recordResult(index as 0 | 1, "wrong")}>✕ 오답</button></div>}</article>)}</div>{expired && !bothRecorded && <p className="expired-help">시간이 끝났어요. 두 팀의 결과를 기록해 주세요.</p>}</div>}

        {phase === "empty" && <div className="empty-state"><span className="stage-icon">✓</span><h1>준비한 주제를 모두 사용했어요</h1><p>처음부터 다시 하거나 주제 목록을 바꿀 수 있어요.</p><button className="button primary" onClick={() => resetGame()}>같은 주제로 다시 시작</button></div>}
      </section>

      <section className="primary-actions">
        {phase === "initial" && <><button className="button secondary giant" data-testid="change-topics" onClick={() => setPickerOpen(true)}>주제 바꾸기</button><button className="button primary giant" data-testid="draw" onClick={choosePair}>두 팀 주제 뽑기</button></>}
        {phase === "drawn" && <><button className="button secondary giant" onClick={choosePair}>다시 뽑기</button><button className="button primary giant" data-testid="start-round" onClick={startRound}>동시에 시작</button></>}
        {phase === "playing" && bothRecorded && <button className="button primary giant" data-testid="finish-round" onClick={finishRound}>이번 라운드 마치기</button>}
      </section>

      <section className="history"><div><h2>진행 기록</h2><p>팀 이름을 바꾸면 이후 기록부터 새 이름이 사용돼요.</p></div><div className="history-list">{history.length === 0 ? <span className="history-empty">아직 기록이 없어요.</span> : history.map((item) => <span className={item.result} key={item.id}>{item.emoji} {item.topic} · {item.team} {item.result === "correct" ? "⭕" : "✕"}</span>)}</div></section>
    </main>

    {pickerOpen && <TopicPicker initialTopics={topics} onApply={applyTopics} onClose={() => setPickerOpen(false)} />}
  </div>;
}
