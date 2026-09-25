/*
 * Deterministic parsers: the numbers Jev never guesses.
 */

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty-five": 45, fifty: 50, sixty: 60, ninety: 90,
};
const NUM = `(\\d+(?:\\.\\d+)?|${Object.keys(WORD_NUMBERS).join("|")})`;
const DURATION = new RegExp(`\\b${NUM}[\\s-]*(seconds?|secs?|s|minutes?|mins?)\\b`, "i");
const HALF_MINUTE = /\bhalf (a )?minute\b/i;

const toNumber = (s: string) => WORD_NUMBERS[s.toLowerCase()] ?? parseFloat(s);

/** "30s", "45 seconds", "2 min", "1.5 minutes", "one minute", "half a minute" → ms. Unclamped. */
export function parseDurationMs(text: string): number | null {
  if (HALF_MINUTE.test(text)) return 30_000;
  const m = DURATION.exec(text);
  if (!m) return null;
  const n = toNumber(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2].toLowerCase();
  return Math.round(unit.startsWith("m") ? n * 60_000 : n * 1000);
}

/** "pop 100", "100 dots", "50 targets" → 100 / 100 / 50. */
export function parseTargetCount(text: string): number | null {
  const m = /\bpop\s+(\d{1,4})\b/i.exec(text) ?? /\b(\d{1,4})\s+(dots|targets|pops)\b/i.exec(text);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n > 0 ? n : null;
}

/** 'called Dot Storm with no bombs' → "Dot Storm". Up to 4 words, 32 chars. */
export function parseName(text: string): string | null {
  const m = /\b(?:called|named|titled)\s+["“']?([^"”',.!?\n]{1,60})/i.exec(text);
  if (!m) return null;
  const cut = m[1].split(/\s+(?:with|and|that|where|for|in|on|but)\b/i)[0];
  const name = cut.trim().split(/\s+/).slice(0, 4).join(" ").slice(0, 32).trim();
  return name || null;
}
