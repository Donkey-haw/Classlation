import { useEffect } from "react";
import { StudentApp } from "./StudentApp";
import { TeacherApp } from "./TeacherApp";
import { useFullscreenShortcut } from "./useFullscreen";

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (milliseconds: number) => void;
  }
}

export function App() {
  useFullscreenShortcut();
  const isStudent = window.location.pathname.startsWith("/join");

  useEffect(() => {
    window.render_game_to_text = () => JSON.stringify({
      app: "Classroom Liar",
      view: isStudent ? "student" : "teacher",
      screenText: document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 1200),
      note: "DOM 기반 대면 의사소통 게임. 위치 좌표나 애니메이션 상태는 없음.",
    });
    window.advanceTime = () => undefined;
  });

  return isStudent ? <StudentApp /> : <TeacherApp />;
}
