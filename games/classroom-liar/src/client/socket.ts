import { io } from "socket.io-client";

export const socket = io({ autoConnect: true });

export function emitWithAck<T>(event: string, payload: object = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (error: Error | null, result: { ok: boolean; data?: T; error?: string }) => {
      if (error) {
        reject(new Error("서버 응답이 없습니다. 교사와 같은 와이파이인지 확인해 주세요."));
        return;
      }
      if (!result.ok) {
        reject(new Error(result.error || "요청을 처리하지 못했습니다."));
        return;
      }
      resolve(result.data as T);
    });
  });
}
