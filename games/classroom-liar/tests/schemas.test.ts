import { describe, expect, it } from "vitest";
import { parsePayload, studentJoinSchema, teacherCreateSchema } from "../src/server/schemas";

describe("socket payload validation", () => {
  it("accepts a bounded teacher setup payload", () => {
    const parsed = parsePayload(teacherCreateSchema, {
      category: "과학",
      topics: [{ word: "광합성" }, { word: "증발" }],
      preferredTeamSize: 5,
      roundCount: 3,
    });
    expect(parsed.topics).toHaveLength(2);
  });

  it("rejects extra fields and oversized names at the socket boundary", () => {
    expect(() => parsePayload(studentJoinSchema, { roomCode: "123456", name: "학생", role: "liar" })).toThrow();
    expect(() => parsePayload(studentJoinSchema, { roomCode: "123456", name: "열세글자가넘는학생이름입니다" })).toThrow();
  });
});
