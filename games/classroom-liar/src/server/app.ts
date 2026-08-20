import { existsSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";
import type { ZodType } from "zod";
import type { Ack, StudentSnapshot, TeacherSnapshot } from "../shared/types";
import { ClassroomLiarStore, GameError } from "./gameStore";
import {
  approveRejoinSchema,
  emptySchema,
  movePlayerSchema,
  parsePayload,
  rejectRejoinSchema,
  studentJoinSchema,
  studentRejoinRequestSchema,
  studentResumeSchema,
  targetSchema,
  teacherCreateSchema,
  teacherResumeSchema,
  teamSchema,
} from "./schemas";

type TeacherSession = { role: "teacher"; roomCode: string; teacherToken: string };
type StudentSession = { role: "student"; roomCode: string; playerId: string; resumeToken: string };
type Session = TeacherSession | StudentSession;

function localAddress(): string | undefined {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof GameError) return error.message;
  console.error(error);
  return "처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.";
}

export function createClassroomLiarServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const io = new Server(httpServer, { cors: { origin: true, credentials: true } });
  const store = new ClassroomLiarStore();
  const sessions = new Map<string, Session>();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.get("/api/health", (_request, response) => response.json({ ok: true, app: "classroom-liar" }));
  app.get("/api/local-ip", (_request, response) => response.json({ address: localAddress() }));

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const clientDir = resolve(currentDir, "../../dist/client");
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get("*path", (_request, response) => response.sendFile(resolve(clientDir, "index.html")));
  }

  function emitRoom(roomCode: string) {
    const audience = store.roomAudience(roomCode);
    const teacherSession = [...sessions.values()].find(
      (session): session is TeacherSession => session.role === "teacher" && session.roomCode === roomCode,
    );
    if (audience.teacherSocketId && teacherSession) {
      io.to(audience.teacherSocketId).emit(
        "teacher:snapshot",
        store.getTeacherSnapshot(roomCode, teacherSession.teacherToken),
      );
    }
    for (const student of audience.students) {
      if (student.socketId) {
        io.to(student.socketId).emit("student:snapshot", store.getStudentSnapshot(roomCode, student.playerId));
      }
    }
  }

  io.on("connection", (socket) => {
    socket.on(
      "teacher:create",
      (
        payload: unknown,
        ack: (result: Ack<{ roomCode: string; teacherToken: string; snapshot: TeacherSnapshot }>) => void,
      ) => {
        try {
          const created = store.createRoom(parsePayload(teacherCreateSchema, payload), socket.id);
          sessions.set(socket.id, { role: "teacher", roomCode: created.roomCode, teacherToken: created.teacherToken });
          ack({ ok: true, data: created });
        } catch (error) {
          ack({ ok: false, error: errorMessage(error) });
        }
      },
    );

    socket.on(
      "teacher:resume",
      (
        payload: unknown,
        ack: (result: Ack<TeacherSnapshot>) => void,
      ) => {
        try {
          const { roomCode, teacherToken } = parsePayload(teacherResumeSchema, payload);
          const snapshot = store.attachTeacher(roomCode, teacherToken, socket.id);
          sessions.set(socket.id, { role: "teacher", roomCode, teacherToken });
          ack({ ok: true, data: snapshot });
          emitRoom(roomCode);
        } catch (error) {
          ack({ ok: false, error: errorMessage(error) });
        }
      },
    );

    socket.on(
      "student:join",
      (
        payload: unknown,
        ack: (
          result: Ack<{ playerId: string; resumeToken: string; snapshot: StudentSnapshot }>,
        ) => void,
      ) => {
        try {
          const { roomCode, name } = parsePayload(studentJoinSchema, payload);
          const joined = store.joinStudent(roomCode, name, socket.id);
          sessions.set(socket.id, {
            role: "student",
            roomCode,
            playerId: joined.playerId,
            resumeToken: joined.resumeToken,
          });
          ack({ ok: true, data: joined });
          emitRoom(roomCode);
        } catch (error) {
          ack({ ok: false, error: errorMessage(error) });
        }
      },
    );

    socket.on(
      "student:resume",
      (
        payload: unknown,
        ack: (result: Ack<StudentSnapshot>) => void,
      ) => {
        try {
          const { roomCode, playerId, resumeToken } = parsePayload(studentResumeSchema, payload);
          const snapshot = store.resumeStudent(roomCode, playerId, resumeToken, socket.id);
          sessions.set(socket.id, { role: "student", roomCode, playerId, resumeToken });
          ack({ ok: true, data: snapshot });
          emitRoom(roomCode);
        } catch (error) {
          ack({ ok: false, error: errorMessage(error) });
        }
      },
    );

    socket.on(
      "student:request-rejoin",
      (payload: unknown, ack: (result: Ack<{ requestId: string }>) => void) => {
        try {
          const { roomCode, name } = parsePayload(studentRejoinRequestSchema, payload);
          const request = store.requestRejoin(roomCode, name, socket.id);
          ack({ ok: true, data: request });
          emitRoom(roomCode);
        } catch (error) {
          ack({ ok: false, error: errorMessage(error) });
        }
      },
    );

    function teacherAction<T>(
      event: string,
      schema: ZodType<T>,
      action: (session: TeacherSession, payload: T) => void,
    ) {
      socket.on(event, (rawPayload: unknown, ack: (result: Ack) => void = () => undefined) => {
        try {
          const session = sessions.get(socket.id);
          if (!session || session.role !== "teacher") throw new GameError("교사 연결을 다시 확인해 주세요.");
          const payload = parsePayload(schema, rawPayload);
          action(session, payload);
          ack({ ok: true });
          emitRoom(session.roomCode);
        } catch (error) {
          ack({ ok: false, error: errorMessage(error) });
        }
      });
    }

    function studentAction<T>(
      event: string,
      schema: ZodType<T>,
      action: (session: StudentSession, payload: T) => void,
    ) {
      socket.on(event, (rawPayload: unknown, ack: (result: Ack) => void = () => undefined) => {
        try {
          const session = sessions.get(socket.id);
          if (!session || session.role !== "student") throw new GameError("학생 연결을 다시 확인해 주세요.");
          const payload = parsePayload(schema, rawPayload);
          action(session, payload);
          ack({ ok: true });
          emitRoom(session.roomCode);
        } catch (error) {
          ack({ ok: false, error: errorMessage(error) });
        }
      });
    }

    teacherAction("teacher:assign-teams", emptySchema, (session) =>
      store.assignTeams(session.roomCode, session.teacherToken),
    );
    teacherAction("teacher:reshuffle-teams", emptySchema, (session) =>
      store.reshuffleTeams(session.roomCode, session.teacherToken),
    );
    teacherAction("teacher:add-team", emptySchema, (session) =>
      store.addTeam(session.roomCode, session.teacherToken),
    );
    teacherAction("teacher:remove-team", teamSchema, (session, payload) =>
      store.removeTeam(session.roomCode, session.teacherToken, payload.teamId),
    );
    teacherAction("teacher:move-player", movePlayerSchema, (session, payload) =>
      store.movePlayer(session.roomCode, session.teacherToken, payload.playerId, payload.teamId),
    );
    teacherAction("teacher:start", emptySchema, (session) => store.startGame(session.roomCode, session.teacherToken));
    teacherAction("teacher:advance-discussion", teamSchema, (session, payload) =>
      store.advanceTeamDiscussion(session.roomCode, session.teacherToken, payload.teamId),
    );
    teacherAction("teacher:next-round", emptySchema, (session) => store.nextRound(session.roomCode, session.teacherToken));

    socket.on("teacher:approve-rejoin", (rawPayload: unknown, ack: (result: Ack) => void = () => undefined) => {
      try {
        const session = sessions.get(socket.id);
        if (!session || session.role !== "teacher") throw new GameError("교사 연결을 다시 확인해 주세요.");
        const { requestId, playerId } = parsePayload(approveRejoinSchema, rawPayload);
        const approved = store.approveRejoin(session.roomCode, session.teacherToken, requestId, playerId);
        sessions.set(approved.socketId, {
          role: "student",
          roomCode: session.roomCode,
          playerId: approved.playerId,
          resumeToken: approved.resumeToken,
        });
        io.to(approved.socketId).emit("student:rejoin-approved", {
          roomCode: session.roomCode,
          playerId: approved.playerId,
          resumeToken: approved.resumeToken,
          snapshot: approved.snapshot,
        });
        ack({ ok: true });
        emitRoom(session.roomCode);
      } catch (error) {
        ack({ ok: false, error: errorMessage(error) });
      }
    });

    socket.on("teacher:reject-rejoin", (rawPayload: unknown, ack: (result: Ack) => void = () => undefined) => {
      try {
        const session = sessions.get(socket.id);
        if (!session || session.role !== "teacher") throw new GameError("교사 연결을 다시 확인해 주세요.");
        const { requestId } = parsePayload(rejectRejoinSchema, rawPayload);
        const rejected = store.rejectRejoin(session.roomCode, session.teacherToken, requestId);
        io.to(rejected.socketId).emit("student:rejoin-rejected", "선생님이 재입장 요청을 확인하지 못했습니다. 이름을 확인해 다시 요청하세요.");
        ack({ ok: true });
        emitRoom(session.roomCode);
      } catch (error) {
        ack({ ok: false, error: errorMessage(error) });
      }
    });

    socket.on("teacher:end", (rawPayload: unknown, ack: (result: Ack) => void = () => undefined) => {
      try {
        parsePayload(emptySchema, rawPayload);
        const session = sessions.get(socket.id);
        if (!session || session.role !== "teacher") throw new GameError("교사 연결을 다시 확인해 주세요.");
        store.endGame(session.roomCode, session.teacherToken);
        emitRoom(session.roomCode);
        store.deleteRoom(session.roomCode);
        for (const [socketId, activeSession] of sessions) {
          if (activeSession.roomCode === session.roomCode) sessions.delete(socketId);
        }
        ack({ ok: true });
      } catch (error) {
        ack({ ok: false, error: errorMessage(error) });
      }
    });

    studentAction("student:confirm", emptySchema, (session) => store.confirmSecret(session.roomCode, session.playerId));
    studentAction("student:start-vote", emptySchema, (session) =>
      store.startTeamVote(session.roomCode, session.playerId),
    );
    studentAction("student:vote", targetSchema, (session, payload) =>
      store.vote(session.roomCode, session.playerId, payload.targetId),
    );
    studentAction("student:start-runoff-vote", emptySchema, (session) =>
      store.startRunoffVote(session.roomCode, session.playerId),
    );
    studentAction("student:runoff-vote", targetSchema, (session, payload) =>
      store.runoffVote(session.roomCode, session.playerId, payload.targetId),
    );
    studentAction("student:reveal-answer", emptySchema, (session) =>
      store.revealAnswer(session.roomCode, session.playerId),
    );

    socket.on("disconnect", () => {
      sessions.delete(socket.id);
      const roomCode = store.disconnect(socket.id);
      if (roomCode) emitRoom(roomCode);
    });
  });

  return { app, httpServer, io, store };
}
