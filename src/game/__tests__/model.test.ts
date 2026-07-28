import { describe, expect, it } from 'vitest';

import {
  DIFFICULTIES,
  accuracyPercent,
  enemySpeed,
  missionFor,
  normalizeAnswer,
  scoreHit,
  spawnInterval,
} from '../model';

describe('typing shooter model', () => {
  it('normalizes punctuation, case and whitespace without changing apostrophes', () => {
    expect(normalizeAnswer("  Don't,  GIVE up! ")).toBe("don't give up");
  });

  it('uses four finite waves for both mission modes', () => {
    expect(missionFor('word')).toEqual({ goal: 20, perWave: 5, waves: 4 });
    expect(missionFor('sentence')).toEqual({ goal: 8, perWave: 2, waves: 4 });
  });

  it('increases pressure by wave and eases pressure for a struggling player', () => {
    const standard = DIFFICULTIES.standard;
    expect(spawnInterval(standard, 3, 0.9)).toBeLessThan(spawnInterval(standard, 1, 0.9));
    expect(spawnInterval(standard, 2, 0.4)).toBeGreaterThan(spawnInterval(standard, 2, 0.9));
    expect(enemySpeed(standard, 3, 3)).toBeGreaterThan(enemySpeed(standard, 1, 3));
    expect(enemySpeed(standard, 3, 1)).toBeLessThan(enemySpeed(standard, 3, 3));
  });

  it('rewards combo, wave progression and higher difficulty', () => {
    const base = scoreHit('word', DIFFICULTIES.standard, 1, 1);
    expect(scoreHit('word', DIFFICULTIES.standard, 5, 1)).toBeGreaterThan(base);
    expect(scoreHit('word', DIFFICULTIES.standard, 1, 3)).toBeGreaterThan(base);
    expect(scoreHit('word', DIFFICULTIES.challenge, 1, 1)).toBeGreaterThan(base);
    expect(scoreHit('sentence', DIFFICULTIES.standard, 1, 1)).toBeGreaterThan(base);
  });

  it('reports accuracy safely before the first attempt', () => {
    expect(accuracyPercent(0, 0)).toBe(100);
    expect(accuracyPercent(7, 10)).toBe(70);
  });
});
