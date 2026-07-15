import { describe, expect, it } from 'vitest';
import { normalizeUsage } from './router';

describe('normalizeUsage (extraction normalisée, SPEC.md §7)', () => {
  it.each([
    [
      { inputTokens: 100, outputTokens: 50 },
      { inputTokens: 100, outputTokens: 50 },
    ],
    [{}, { inputTokens: 0, outputTokens: 0 }],
    [
      { inputTokens: undefined, outputTokens: 7 },
      { inputTokens: 0, outputTokens: 7 },
    ],
  ])('%o -> %o', (raw, expected) => {
    expect(normalizeUsage(raw)).toEqual(expected);
  });
});
