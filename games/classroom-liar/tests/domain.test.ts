import { describe, expect, it } from "vitest";
import { chooseLiar, createTeamSizes, normalizeGuess, tallyVotes } from "../src/server/domain";

describe("team allocation", () => {
  it("keeps every automatically created team at three or more students", () => {
    for (let players = 3; players <= 32; players += 1) {
      const sizes = createTeamSizes(players, 5);
      expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(players);
      expect(sizes.every((size) => size >= 3)).toBe(true);
    }
  });

  it("allows a large preferred team instead of enforcing a six-person cap", () => {
    expect(createTeamSizes(32, 32)).toEqual([32]);
    expect(createTeamSizes(20, 10)).toEqual([10, 10]);
    expect(createTeamSizes(7, 4)).toEqual([4, 3]);
  });

  it("rejects classes outside the supported range", () => {
    expect(() => createTeamSizes(2, 5)).toThrow();
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
