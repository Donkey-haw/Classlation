import { describe, expect, it } from "vitest";
import { createCrop, getChosung, moveItem, validateImageFile } from "../src/domain/game";

describe("magnifier mystery domain", () => {
  it("extracts Korean initial consonants while preserving other characters", () => {
    expect(getChosung("축구공 2")).toBe("ㅊㄱㄱ 2");
  });

  it("creates a crop inside the source image", () => {
    expect(createCrop(1000, 800, 0.18, () => 0.5)).toEqual({ x: 428, y: 328, width: 144, height: 144 });
  });

  it("keeps the crop square so the enlarged image is not distorted", () => {
    const crop = createCrop(1600, 900, 0.28, () => 0.25);
    expect(crop.width).toBe(crop.height);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1600);
    expect(crop.y + crop.height).toBeLessThanOrEqual(900);
  });

  it("moves questions without mutating the source", () => {
    const source = ["a", "b", "c"];
    expect(moveItem(source, 1, -1)).toEqual(["b", "a", "c"]);
    expect(source).toEqual(["a", "b", "c"]);
  });

  it("rejects non-image and oversized files", () => {
    expect(validateImageFile({ type: "text/plain", size: 10 })).toContain("이미지");
    expect(validateImageFile({ type: "image/png", size: 13 * 1024 * 1024 })).toContain("12MB");
    expect(validateImageFile({ type: "image/png", size: 10 })).toBeNull();
  });
});
