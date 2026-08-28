export type Crop = { x: number; y: number; width: number; height: number };

const CHOSUNG = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

export function getChosung(text: string): string {
  return Array.from(text).map((character) => {
    const code = character.charCodeAt(0) - 44032;
    if (code >= 0 && code <= 11171) return CHOSUNG[Math.floor(code / 588)];
    if (/\s/u.test(character)) return character;
    return "•";
  }).join("");
}

export function createCrop(
  imageWidth: number,
  imageHeight: number,
  ratio: number,
  random: () => number = Math.random,
): Crop {
  const size = Math.max(20, Math.floor(Math.min(imageWidth, imageHeight) * ratio));
  return {
    x: Math.floor(random() * Math.max(1, imageWidth - size)),
    y: Math.floor(random() * Math.max(1, imageHeight - size)),
    width: size,
    height: size,
  };
}

export function createDistinctCrop(
  imageWidth: number,
  imageHeight: number,
  ratio: number,
  previous?: Crop,
  random: () => number = Math.random,
): Crop {
  let candidate = createCrop(imageWidth, imageHeight, ratio, random);
  for (let attempt = 0; previous && attempt < 8; attempt += 1) {
    const distance = Math.hypot(candidate.x - previous.x, candidate.y - previous.y);
    if (distance >= Math.min(candidate.width, candidate.height) * 0.45) break;
    candidate = createCrop(imageWidth, imageHeight, ratio, random);
  }
  return candidate;
}

export function moveItem<T>(items: T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function answerFromFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const withoutExtension = trimmed.replace(/\.[^./\\]+$/, "").trim();
  return withoutExtension || trimmed || "정답 입력";
}

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export function validateImageFile(file: Pick<File, "type" | "size">): string | null {
  if (!file.type.startsWith("image/")) return "이미지 파일만 선택할 수 있어요.";
  if (file.size > MAX_IMAGE_BYTES) return "사진 한 장은 12MB보다 작아야 해요.";
  return null;
}
