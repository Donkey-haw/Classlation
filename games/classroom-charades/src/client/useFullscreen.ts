import { useEffect } from "react";

export function useFullscreenShortcut() {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f" || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}
