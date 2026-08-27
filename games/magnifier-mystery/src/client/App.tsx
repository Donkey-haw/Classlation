import { useEffect, useMemo, useRef, useState } from "react";
import { createDistinctCrop, getChosung, moveItem, validateImageFile, type Crop } from "../domain/game";
import { useFullscreenShortcut } from "./useFullscreen";

type Screen = "setup" | "game" | "result";
type Question = { id: string; answer: string; imageUrl: string; fileName: string; ownedUrl: boolean };

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (milliseconds: number) => void;
  }
}

let nextId = 1;
const emptyQuestion = (): Question => ({ id: String(nextId++), answer: "", imageUrl: "", fileName: "", ownedUrl: false });

function playTone(kind: "click" | "reveal", enabled: boolean) {
  if (!enabled) return;
  try {
    const audio = new AudioContext();
    const notes = kind === "reveal" ? [523, 659, 784] : [520];
    notes.forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.12, audio.currentTime + index * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.15 + index * 0.08);
      oscillator.start(audio.currentTime + index * 0.08);
      oscillator.stop(audio.currentTime + 0.18 + index * 0.08);
    });
    window.setTimeout(() => void audio.close(), 700);
  } catch { /* Audio is optional. */ }
}

export function App() {
  useFullscreenShortcut();
  const [screen, setScreen] = useState<Screen>("setup");
  const [questions, setQuestions] = useState<Question[]>([emptyQuestion()]);
  const [gameQuestions, setGameQuestions] = useState<Question[]>([]);
  const [difficulty, setDifficulty] = useState(0.18);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [clueStep, setClueStep] = useState(1);
  const [crop, setCrop] = useState<Crop>();
  const [revealed, setRevealed] = useState(false);
  const [showChosung, setShowChosung] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notice, setNotice] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ownedUrls = useRef(new Set<string>());
  const current = gameQuestions[currentIndex];

  useEffect(() => () => ownedUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const updateQuestion = (id: string, patch: Partial<Question>) => {
    setQuestions((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const chooseImage = (question: Question, file?: File) => {
    if (!file) return;
    const error = validateImageFile(file);
    if (error) { setNotice(error); return; }
    const nextUrl = URL.createObjectURL(file);
    ownedUrls.current.add(nextUrl);
    const testImage = new Image();
    testImage.onload = () => {
      if (question.ownedUrl) { URL.revokeObjectURL(question.imageUrl); ownedUrls.current.delete(question.imageUrl); }
      setQuestions((items) => items.map((item) => item.id === question.id ? {
        ...item,
        imageUrl: nextUrl,
        fileName: file.name,
        ownedUrl: true,
        answer: item.answer || file.name.replace(/\.[^.]+$/, ""),
      } : item));
      setNotice("");
    };
    testImage.onerror = () => {
      URL.revokeObjectURL(nextUrl);
      ownedUrls.current.delete(nextUrl);
      setNotice("이 사진은 브라우저에서 열 수 없어요. 다른 파일을 선택해 주세요.");
    };
    testImage.src = nextUrl;
  };

  const removeQuestion = (index: number) => {
    if (questions.length === 1) { setNotice("문제는 한 개 이상 필요해요."); return; }
    const target = questions[index];
    if (target.ownedUrl) { URL.revokeObjectURL(target.imageUrl); ownedUrls.current.delete(target.imageUrl); }
    setQuestions((items) => items.filter((_, itemIndex) => itemIndex !== index));
  };

  const startGame = () => {
    if (questions.some((question) => !question.imageUrl || !question.answer.trim())) {
      setNotice("모든 문제에 사진과 정답을 입력해 주세요.");
      return;
    }
    setGameQuestions(questions.map((question) => ({ ...question, answer: question.answer.trim() })));
    setCurrentIndex(0);
    setClueStep(1);
    setCrop(undefined);
    setRevealed(false);
    setShowChosung(false);
    setScreen("game");
    setNotice("");
  };

  useEffect(() => {
    if (screen !== "game" || !current || revealed) return;
    const image = new Image();
    image.onload = () => {
      const nextCrop = crop ?? createDistinctCrop(image.naturalWidth, image.naturalHeight, difficulty);
      if (!crop) setCrop(nextCrop);
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      canvas.width = 900;
      canvas.height = 620;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, nextCrop.x, nextCrop.y, nextCrop.width, nextCrop.height, 0, 0, canvas.width, canvas.height);
    };
    image.src = current.imageUrl;
  }, [screen, current, crop, difficulty, revealed]);

  const nextClue = () => {
    if (!current || revealed) return;
    const image = new Image();
    image.onload = () => {
      setCrop(createDistinctCrop(image.naturalWidth, image.naturalHeight, difficulty, crop));
      setClueStep((step) => step + 1);
      playTone("click", soundEnabled);
    };
    image.src = current.imageUrl;
  };

  const nextQuestion = () => {
    playTone("click", soundEnabled);
    if (currentIndex + 1 >= gameQuestions.length) { setScreen("result"); return; }
    setCurrentIndex((index) => index + 1);
    setClueStep(1);
    setCrop(undefined);
    setRevealed(false);
    setShowChosung(false);
  };

  const textState = useMemo(() => ({
    app: "magnifier-mystery",
    screen,
    questionCount: screen === "setup" ? questions.length : gameQuestions.length,
    currentQuestion: screen === "game" ? currentIndex + 1 : null,
    clueStep,
    revealed,
    showChosung,
  }), [screen, questions.length, gameQuestions.length, currentIndex, clueStep, revealed, showChosung]);

  useEffect(() => {
    window.render_game_to_text = () => JSON.stringify(textState);
    window.advanceTime = () => undefined;
    return () => { delete window.render_game_to_text; delete window.advanceTime; };
  }, [textState]);

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setScreen("setup")}><span aria-hidden>⌕</span><span>돋보기 추리왕<small>교사용 · 교실 TV 화면</small></span></button>
      <div className="header-actions">
        <button className="button ghost" onClick={() => setSoundEnabled((value) => !value)}>{soundEnabled ? "🔊 소리 켬" : "🔇 음소거"}</button>
        <button className="button ghost" onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()}>전체 화면 <kbd>F</kbd></button>
      </div>
    </header>

    {screen === "setup" && <main className="setup-page" data-testid="setup-screen">
      <section className="page-heading"><div><span className="eyebrow">문제 준비</span><h1>사진을 등록하고 추리 순서를 정하세요</h1><p>사진은 이 브라우저에서만 사용되며 서버나 외부 서비스로 전송되지 않아요.</p></div>
        <label className="difficulty">확대 범위<select value={difficulty} onChange={(event) => setDifficulty(Number(event.target.value))}><option value={0.1}>어려움 · 10%</option><option value={0.18}>보통 · 18%</option><option value={0.28}>쉬움 · 28%</option></select></label>
      </section>
      {notice && <p className="notice" role="alert">{notice}</p>}
      <div className="question-list">
        {questions.map((question, index) => <article className="question-card" key={question.id}>
          <div className="question-number">문제 {index + 1}</div>
          <label className={`upload ${question.imageUrl ? "has-image" : ""}`}>
            {question.imageUrl ? <img src={question.imageUrl} alt="선택한 문제" /> : <span>사진 선택</span>}
            <input data-testid={`image-${index}`} type="file" accept="image/*" onChange={(event) => chooseImage(question, event.target.files?.[0])} />
          </label>
          <label className="answer-field">정답<input data-testid={`answer-${index}`} value={question.answer} onChange={(event) => updateQuestion(question.id, { answer: event.target.value })} placeholder="예: 축구공" /></label>
          <div className="card-actions"><button aria-label="위로 이동" disabled={index === 0} onClick={() => setQuestions((items) => moveItem(items, index, -1))}>↑</button><button aria-label="아래로 이동" disabled={index === questions.length - 1} onClick={() => setQuestions((items) => moveItem(items, index, 1))}>↓</button><button aria-label="문제 삭제" onClick={() => removeQuestion(index)}>삭제</button></div>
        </article>)}
      </div>
      <div className="setup-actions"><button className="button secondary" onClick={() => setQuestions((items) => [...items, emptyQuestion()])}>+ 문제 추가</button><button className="button primary" data-testid="start-game" onClick={startGame}>총 {questions.length}문제로 시작</button></div>
    </main>}

    {screen === "game" && current && <main className="game-page" data-testid="game-screen">
      <div className="game-status"><strong>문제 {currentIndex + 1} / {gameQuestions.length}</strong><div className="progress"><span style={{ width: `${((currentIndex + 1) / gameQuestions.length) * 100}%` }} /></div><span>{revealed ? "정답 공개" : `부분 확대 ${clueStep}번째`}</span></div>
      <section className="mystery-stage">
        {showChosung && !revealed && <div className="chosung" data-testid="chosung"><small>초성 힌트</small>{getChosung(current.answer)}</div>}
        {revealed ? <div className="reveal" data-testid="revealed"><img src={current.imageUrl} alt="정답 사진" /><div><small>정답</small><strong>{current.answer}</strong></div></div> : <canvas ref={canvasRef} aria-label="사진의 확대된 일부" />}
      </section>
      <div className="game-controls"><button className="button clue" data-testid="next-clue" disabled={revealed} onClick={nextClue}>다른 부분 보기</button><button className="button hint" onClick={() => setShowChosung((value) => !value)}>초성 힌트</button><button className="button reveal-button" data-testid="reveal" onClick={() => { setRevealed(true); playTone("reveal", soundEnabled); }}>정답 공개</button><button className="button primary" data-testid="next-question" onClick={nextQuestion}>{currentIndex + 1 === gameQuestions.length ? "게임 마치기" : "다음 문제"}</button></div>
    </main>}

    {screen === "result" && <main className="result-page" data-testid="result-screen"><div className="result-mark">✓</div><span className="eyebrow">완료</span><h1>총 {gameQuestions.length}문제를 모두 풀었어요</h1><div className="result-actions"><button className="button primary" onClick={() => { setCurrentIndex(0); setCrop(undefined); setClueStep(1); setRevealed(false); setScreen("game"); }}>같은 문제 다시 하기</button><button className="button secondary" onClick={() => setScreen("setup")}>문제 편집하기</button></div></main>}
  </div>;
}
