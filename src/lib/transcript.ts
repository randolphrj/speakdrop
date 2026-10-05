export const countWords = (text: string): number => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
};

/**
 * Keep only the trailing words of `text` that fit within `maxChars`,
 * prefixed with an ellipsis when anything was dropped. Used for one-line
 * live captions.
 */
export const tailWords = (text: string, maxChars: number): string => {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxChars) return trimmed;
  const words = trimmed.split(" ");
  let tail = "";
  for (let i = words.length - 1; i >= 0; i--) {
    const candidate = tail ? `${words[i]} ${tail}` : words[i];
    if (candidate.length + 1 > maxChars) break;
    tail = candidate;
  }
  // A single word longer than the budget: keep its last characters.
  if (!tail) tail = trimmed.slice(-(maxChars - 1));
  return `…${tail}`;
};

export const buildDisplayTranscript = (
  finalText: string,
  partialText: string,
): string => {
  const finalTrimmed = finalText.trim();
  const partialTrimmed = partialText.trim();
  if (!partialTrimmed) return finalTrimmed;
  if (!finalTrimmed) return partialTrimmed;
  if (partialTrimmed.startsWith(finalTrimmed)) return partialTrimmed;
  return `${finalTrimmed} ${partialTrimmed}`;
};
