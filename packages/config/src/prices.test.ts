import { describe, expect, it } from 'vitest';
import { computeCostUsd, loadPrices } from './prices';

describe('prices.yaml (metering, SPEC.md §7)', () => {
  const prices = loadPrices();

  it('est daté (as_of) — des prix non datés sont interdits', () => {
    expect(prices.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('couvre les modèles du router', () => {
    for (const model of ['claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-4-8']) {
      expect(prices.models[model], model).toBeDefined();
    }
  });

  describe('computeCostUsd', () => {
    it.each([
      // [modèle, in, out, attendu USD]
      ['claude-sonnet-5', 1_000_000, 0, 3.0],
      ['claude-sonnet-5', 0, 1_000_000, 15.0],
      ['claude-sonnet-5', 1000, 500, 0.0105],
      ['claude-haiku-4-5', 2000, 1000, 0.007],
      ['claude-opus-4-8', 100, 100, 0.003],
      ['claude-sonnet-5', 0, 0, 0],
    ])('%s in=%i out=%i -> %f $', (model, input, output, expected) => {
      expect(computeCostUsd(prices, model, input, output)).toBeCloseTo(expected, 10);
    });

    it('refuse un modèle inconnu (fail-closed : jamais d’usage non facturé)', () => {
      expect(() => computeCostUsd(prices, 'gpt-inconnu', 10, 10)).toThrowError(/prices\.yaml/);
    });
  });
});
