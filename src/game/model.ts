export type GameMode = 'word' | 'sentence';
export type DifficultyId = 'training' | 'standard' | 'challenge';

export interface DifficultyConfig {
  readonly id: DifficultyId;
  readonly label: string;
  readonly spawnMs: number;
  readonly speed: number;
  readonly maxEnemies: number;
  readonly scoreMultiplier: number;
}

export interface ShooterItem {
  readonly en: string;
  readonly target: string;
  readonly cn: string;
  readonly audio: string;
  readonly base: string;
}

export interface MissionConfig {
  readonly goal: number;
  readonly perWave: number;
  readonly waves: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  training: {
    id: 'training',
    label: '练习',
    spawnMs: 3700,
    speed: 27,
    maxEnemies: 2,
    scoreMultiplier: 0.85,
  },
  standard: {
    id: 'standard',
    label: '标准',
    spawnMs: 2950,
    speed: 36,
    maxEnemies: 3,
    scoreMultiplier: 1,
  },
  challenge: {
    id: 'challenge',
    label: '挑战',
    spawnMs: 2250,
    speed: 46,
    maxEnemies: 4,
    scoreMultiplier: 1.2,
  },
};

export function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function missionFor(mode: GameMode): MissionConfig {
  return mode === 'sentence'
    ? { goal: 8, perWave: 2, waves: 4 }
    : { goal: 20, perWave: 5, waves: 4 };
}

export function spawnInterval(
  difficulty: DifficultyConfig,
  wave: number,
  accuracy: number,
): number {
  const adaptiveRelief = accuracy < 0.55 ? 1.16 : 1;
  return Math.max(1050, difficulty.spawnMs * (1 - (wave - 1) * 0.09) * adaptiveRelief);
}

export function enemySpeed(
  difficulty: DifficultyConfig,
  wave: number,
  shields: number,
): number {
  const shieldRelief = shields === 1 ? 0.88 : 1;
  return difficulty.speed * (1 + (wave - 1) * 0.13) * shieldRelief;
}

export function scoreHit(
  mode: GameMode,
  difficulty: DifficultyConfig,
  combo: number,
  wave: number,
): number {
  const base = mode === 'sentence' ? 70 : 35;
  return Math.round((base + Math.min(12, combo) * 5 + wave * 8) * difficulty.scoreMultiplier);
}

export function accuracyPercent(correct: number, attempts: number): number {
  return attempts === 0 ? 100 : Math.round((correct / attempts) * 100);
}
