import { z } from "zod";
import { GameError } from "./gameStore";

const roomCode = z.string().trim().regex(/^\d{6}$/, "방 코드는 6자리 숫자여야 합니다.");
const token = z.string().uuid("연결 정보가 올바르지 않습니다.");

export const teacherCreateSchema = z.object({
  category: z.string().trim().min(1).max(30),
  topics: z.array(z.object({
    word: z.string().trim().min(1).max(40),
    explanation: z.string().trim().max(120).optional(),
  }).strict()).min(2).max(100),
  preferredTeamSize: z.number().int().min(3).max(32),
  roundCount: z.number().int().min(1).max(10),
  teamMode: z.enum(["fixed", "rotate"]),
}).strict();

export const teacherResumeSchema = z.object({ roomCode, teacherToken: token }).strict();
export const studentJoinSchema = z.object({ roomCode, name: z.string().trim().min(1).max(12) }).strict();
export const studentResumeSchema = z.object({ roomCode, playerId: token, resumeToken: token }).strict();
export const studentRejoinRequestSchema = z.object({ roomCode, name: z.string().trim().min(1).max(12) }).strict();
export const emptySchema = z.object({}).strict();
export const teamSchema = z.object({ teamId: z.string().regex(/^team-\d+$/) }).strict();
export const targetSchema = z.object({ targetId: token }).strict();
export const movePlayerSchema = z.object({ playerId: token, teamId: z.string().regex(/^team-\d+$/) }).strict();
export const approveRejoinSchema = z.object({ requestId: token, playerId: token }).strict();
export const rejectRejoinSchema = z.object({ requestId: token }).strict();
export function parsePayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload ?? {});
  if (result.success) return result.data;
  throw new GameError(result.error.issues[0]?.message || "입력 형식이 올바르지 않습니다.");
}
