import { describe, expect, it } from "vitest";
import { chooseLiar, createTeamSizes, normalizeGuess, tallyVotes } from "../src/server/domain";

describe("team allocation", () => {
  it("keeps ordinary teams between four and six", () => {
    for (let players = 4; players <= 32; players += 1) {
      const sizes = createTeamSizes(players, 5);
      expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(players);
      expect(sizes.every((size) => (players === 7 ? size === 7 : size >= 4 && size <= 6))).toBe(true);
    }
  });

  it("rejects classes outside the supported range", () => {
    expect(() => createTeamSizes(3, 5)).toThrow();
    expect(() => createTeamSizes(33, 5)).toThrow();
  });
});

describe("round helpers", () => {
  it("prefers a player who has been liar fewer times", () => {
    const liar = chooseLiar(["a", "b", "c"], new Map([["a", 2], ["b", 0], ["c", 1]]), () => 0.9);
    expect(liar).toBe("b");
  });

  it("detects a unique vote winner and a tie", () => {
    expect(tallyVotes(new Map([["a", "x"], ["b", "x"], ["c", "y"]])).accusedId).toBe("x");
    expect(tallyVotes(new Map([["a", "x"], ["b", "y"]])).tiedIds.sort()).toEqual(["x", "y"]);
  });

  it("normalizes spacing and case for the liar guess", () => {
    expect(normalizeGuess("  Kim Chi 찌개 ")).toBe(normalizeGuess("kimchi찌개"));
  });
});
