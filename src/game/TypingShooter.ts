import Phaser from 'phaser';

import {
  DIFFICULTIES,
  accuracyPercent,
  enemySpeed,
  missionFor,
  normalizeAnswer,
  scoreHit,
  spawnInterval,
  type DifficultyId,
  type GameMode,
  type ShooterItem,
} from './model';

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;
const BEST_SCORE_KEY = 'els-phaser-game-best-v1';

export interface TypingShooterOptions {
  root: HTMLElement;
  mode: GameMode;
  difficulty: DifficultyId;
  items: ShooterItem[];
  playAudio: (url: string) => void;
  recordAnswer: (item: ShooterItem, correct: boolean) => void;
  onExit: () => void;
}

export interface TypingShooterHandle {
  destroy: () => void;
}

interface HudState {
  score: number;
  combo: number;
  accuracy: number;
  shields: number;
  killed: number;
  goal: number;
  wave: number;
  waves: number;
  waveProgress: number;
}

interface ResultState extends HudState {
  won: boolean;
  misses: number;
  maxCombo: number;
}

interface SceneBridge {
  updateHud: (state: HudState) => void;
  updateFocus: (item: ShooterItem | null) => void;
  showOverlay: (title?: string, subtitle?: string) => void;
  clearInput: () => void;
  setInputEnabled: (enabled: boolean) => void;
  playAudio: (url: string) => void;
  recordAnswer: (item: ShooterItem, correct: boolean) => void;
  showResult: (result: ResultState) => void;
}

interface EnemyEntity {
  item: ShooterItem;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  progress: Phaser.GameObjects.Text;
  dangerBar: Phaser.GameObjects.Graphics;
  lane: number;
  speedScale: number;
  danger: number;
  locked: boolean;
}

type RoundState = 'countdown' | 'playing' | 'break' | 'ending';

class ShooterScene extends Phaser.Scene {
  private readonly options: TypingShooterOptions;
  private readonly bridge: SceneBridge;
  private readonly mission;
  private readonly difficulty;
  private readonly enemies: EnemyEntity[] = [];
  private bag: ShooterItem[] = [];
  private lastBase = '';
  private locked: EnemyEntity | null = null;
  private starfield!: Phaser.GameObjects.TileSprite;
  private ship!: Phaser.GameObjects.Container;
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private roundState: RoundState = 'countdown';
  private paused = false;
  private countdownMs = 2100;
  private breakMs = 0;
  private lastCountdownValue = 3;
  private spawnElapsed = Number.POSITIVE_INFINITY;
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private killed = 0;
  private misses = 0;
  private attempts = 0;
  private shields = 3;
  private wave = 1;
  private waveKills = 0;
  private ready = false;

  constructor(options: TypingShooterOptions, bridge: SceneBridge) {
    super({ key: 'TypingShooterScene' });
    this.options = options;
    this.bridge = bridge;
    this.mission = missionFor(options.mode);
    this.difficulty = DIFFICULTIES[options.difficulty];
  }

  create(): void {
    this.createTextures();
    this.createArena();
    this.createShip();
    this.createParticles();
    this.ready = true;
    this.bridge.setInputEnabled(false);
    this.bridge.showOverlay('3', '锁定目标，输入英文，完成四波防守');
    this.emitHud();
  }

  update(time: number, delta: number): void {
    this.starfield.tilePositionY -= delta * 0.028;
    this.animateShip(time, delta);

    if (!this.ready || this.paused || this.roundState === 'ending') return;

    if (this.roundState === 'countdown') {
      this.countdownMs -= delta;
      const value = Math.max(1, Math.ceil(this.countdownMs / 700));
      if (value !== this.lastCountdownValue) {
        this.lastCountdownValue = value;
        this.bridge.showOverlay(String(value), '锁定目标，输入英文，完成四波防守');
      }
      if (this.countdownMs <= 0) {
        this.roundState = 'playing';
        this.bridge.showOverlay();
        this.bridge.setInputEnabled(true);
        this.spawnEnemy();
        this.spawnElapsed = 0;
      }
      return;
    }

    if (this.roundState === 'break') {
      this.breakMs -= delta;
      if (this.breakMs <= 0) {
        this.roundState = 'playing';
        this.bridge.showOverlay();
        this.bridge.setInputEnabled(true);
        this.spawnEnemy();
        this.spawnElapsed = 0;
      }
      return;
    }

    this.spawnElapsed += delta;
    const accuracy = this.attempts === 0 ? 1 : this.killed / this.attempts;
    const interval = spawnInterval(this.difficulty, this.wave, accuracy);
    const capacity = Math.min(
      this.options.mode === 'sentence' ? 2 : 5,
      this.difficulty.maxEnemies + (this.wave >= 3 ? 1 : 0),
    );
    if (this.spawnElapsed >= interval && this.enemies.length < capacity) {
      this.spawnEnemy();
      this.spawnElapsed = 0;
    }

    const speed = enemySpeed(this.difficulty, this.wave, this.shields);
    const ground = GAME_HEIGHT - 74;
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];
      if (!enemy) continue;
      enemy.container.y += speed * enemy.speedScale * (delta / 1000);
      enemy.container.x += Math.sin(time * 0.0016 + enemy.lane) * delta * 0.006;
      enemy.danger = Phaser.Math.Clamp((enemy.container.y - 45) / (ground - 45), 0, 1);
      this.drawEnemy(enemy);
      if (enemy.container.y >= ground) {
        this.enemies.splice(index, 1);
        this.missEnemy(enemy);
      }
    }

    if (this.locked && !this.enemies.includes(this.locked)) this.pickMostDangerous(true);
  }

  submitInput(rawValue: string): { bad: boolean; hit: boolean } {
    if (!this.ready || this.paused || this.roundState !== 'playing') {
      return { bad: false, hit: false };
    }

    const value = normalizeAnswer(rawValue);
    if (!value) {
      this.updateTypedProgress('');
      return { bad: false, hit: false };
    }

    if (!this.locked || !this.locked.item.target.startsWith(value)) {
      const candidate = this.enemies
        .filter((enemy) => enemy.item.target.startsWith(value))
        .sort((a, b) => b.container.y - a.container.y)[0];
      if (candidate) this.lockEnemy(candidate, false);
    }

    const bad = !this.locked || !this.locked.item.target.startsWith(value);
    this.updateTypedProgress(bad ? '' : value);
    if (!bad && this.locked && value === this.locked.item.target) {
      this.hitEnemy(this.locked);
      return { bad: false, hit: true };
    }
    return { bad, hit: false };
  }

  cycleTarget(): void {
    if (this.paused || this.roundState !== 'playing' || this.enemies.length === 0) return;
    const sorted = [...this.enemies].sort((a, b) => b.container.y - a.container.y);
    const index = sorted.indexOf(this.locked as EnemyEntity);
    const next = sorted[(index + 1) % sorted.length];
    if (next) this.lockEnemy(next, true);
  }

  replayTarget(): void {
    if (!this.locked) this.pickMostDangerous(false);
    if (this.locked) this.bridge.playAudio(this.locked.item.audio);
  }

  setPaused(nextPaused: boolean): void {
    if (!this.ready || this.roundState === 'ending') return;
    this.paused = nextPaused;
    this.bridge.setInputEnabled(!nextPaused && this.roundState === 'playing');
    if (nextPaused) this.bridge.showOverlay('已暂停', '准备好后继续任务');
    else if (this.roundState === 'break')
      this.bridge.showOverlay(`WAVE ${this.wave}`, '新一波即将抵达');
    else if (this.roundState === 'countdown')
      this.bridge.showOverlay(String(this.lastCountdownValue), '锁定目标，输入英文，完成四波防守');
    else this.bridge.showOverlay();
  }

  isPaused(): boolean {
    return this.paused;
  }

  private createTextures(): void {
    const stars = this.add.graphics();
    stars.fillStyle(0x9ec9ff, 0.85);
    for (let i = 0; i < 58; i += 1) {
      const x = (i * 73 + 19) % 256;
      const y = (i * 47 + 31) % 256;
      stars.fillCircle(x, y, i % 9 === 0 ? 1.5 : 0.8);
    }
    stars.generateTexture('typing-shooter-stars', 256, 256);
    stars.destroy();

    const spark = this.add.graphics();
    spark.fillStyle(0xffd76a, 1);
    spark.fillCircle(4, 4, 4);
    spark.generateTexture('typing-shooter-spark', 8, 8);
    spark.destroy();
  }

  private createArena(): void {
    this.starfield = this.add.tileSprite(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      'typing-shooter-stars',
    );
    this.starfield.setTint(0x7fb6ff);

    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x071023, 0.42);
    backdrop.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    backdrop.lineStyle(1, 0x4d6c9f, 0.13);
    for (let x = GAME_WIDTH / 4; x < GAME_WIDTH; x += GAME_WIDTH / 4) {
      backdrop.lineBetween(x, 0, x, GAME_HEIGHT - 70);
    }
    backdrop.fillStyle(0x7d182c, 0.18);
    backdrop.fillRect(0, GAME_HEIGHT - 145, GAME_WIDTH, 145);
    backdrop.lineStyle(2, 0xff6d7b, 0.4);
    backdrop.lineBetween(0, GAME_HEIGHT - 145, GAME_WIDTH, GAME_HEIGHT - 145);
    this.add
      .text(16, GAME_HEIGHT - 138, 'DANGER ZONE', {
        color: '#ff8791',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '12px',
        letterSpacing: 2,
      })
      .setAlpha(0.72);
  }

  private createShip(): void {
    const glow = this.add.circle(0, 6, 30, 0x3f8cff, 0.14);
    const hull = this.add.graphics();
    hull.fillStyle(0x9dd6ff, 1);
    hull.fillTriangle(0, -28, 22, 20, 0, 13);
    hull.fillTriangle(0, -28, -22, 20, 0, 13);
    hull.fillStyle(0xffffff, 1);
    hull.fillTriangle(0, -22, 8, 10, -8, 10);
    hull.lineStyle(2, 0x4ca5ff, 1);
    hull.strokeTriangle(0, -28, 22, 20, -22, 20);
    const thruster = this.add.ellipse(0, 25, 12, 28, 0xffb84d, 0.9);
    this.ship = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 42, [glow, thruster, hull]);
    this.ship.setDepth(20);
    this.tweens.add({
      targets: thruster,
      scaleY: { from: 0.55, to: 1.05 },
      alpha: { from: 0.45, to: 0.95 },
      duration: 130,
      yoyo: true,
      repeat: -1,
    });
  }

  private createParticles(): void {
    this.particles = this.add.particles(0, 0, 'typing-shooter-spark', {
      speed: { min: 90, max: 260 },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 260, max: 620 },
      angle: { min: 0, max: 360 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.particles.setDepth(30);
  }

  private animateShip(_time: number, delta: number): void {
    const targetX = this.locked ? this.locked.container.x : GAME_WIDTH / 2;
    this.ship.x = Phaser.Math.Linear(this.ship.x, targetX, Math.min(1, delta * 0.006));
    this.ship.rotation = Phaser.Math.Clamp((targetX - this.ship.x) * 0.0008, -0.12, 0.12);
  }

  private spawnEnemy(): void {
    const item = this.nextItem();
    if (!item) return;
    const laneCount = this.options.mode === 'sentence' ? 2 : 4;
    const lane = this.chooseLane(laneCount);
    const laneWidth = GAME_WIDTH / laneCount;
    const width = this.options.mode === 'sentence' ? 390 : 214;
    const height = this.options.mode === 'sentence' ? 94 : 78;
    const x = lane * laneWidth + laneWidth / 2;

    const body = this.add.graphics();
    const label = this.add
      .text(0, -9, item.cn, {
        align: 'center',
        color: '#eaf4ff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
        fontSize: this.options.mode === 'sentence' ? '15px' : '17px',
        fontStyle: 'bold',
        wordWrap: { width: width - 34, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    const progress = this.add
      .text(0, height / 2 + 11, '', {
        color: '#ffe08a',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '14px',
      })
      .setOrigin(0.5);
    const dangerBar = this.add.graphics();
    const container = this.add.container(x, -height, [body, label, dangerBar, progress]);
    container.setSize(width, height).setInteractive({ useHandCursor: true });
    container.setDepth(10);

    const enemy: EnemyEntity = {
      item,
      container,
      body,
      label,
      progress,
      dangerBar,
      lane,
      speedScale: 0.92 + Math.random() * 0.18,
      danger: 0,
      locked: false,
    };
    container.on('pointerdown', () => this.lockEnemy(enemy, true));
    this.enemies.push(enemy);
    this.drawEnemy(enemy);
    if (!this.locked) this.lockEnemy(enemy, true);
  }

  private drawEnemy(enemy: EnemyEntity): void {
    const width = this.options.mode === 'sentence' ? 390 : 214;
    const height = this.options.mode === 'sentence' ? 94 : 78;
    const border = enemy.locked ? 0xffd166 : enemy.danger > 0.76 ? 0xff6072 : 0x4d78ad;
    const fill = enemy.danger > 0.76 ? 0x351824 : 0x111f38;
    enemy.body.clear();
    enemy.body.fillStyle(fill, 0.96);
    enemy.body.lineStyle(enemy.locked ? 4 : 2, border, 1);
    enemy.body.fillRoundedRect(-width / 2, -height / 2, width, height, 16);
    enemy.body.strokeRoundedRect(-width / 2, -height / 2, width, height, 16);
    enemy.body.fillStyle(border, 0.92);
    enemy.body.fillTriangle(-width / 2 + 18, -height / 2, -width / 2 + 38, -height / 2, -width / 2 + 28, -height / 2 - 12);
    enemy.body.fillTriangle(width / 2 - 18, -height / 2, width / 2 - 38, -height / 2, width / 2 - 28, -height / 2 - 12);

    enemy.dangerBar.clear();
    enemy.dangerBar.fillStyle(0x2b3d5b, 1);
    enemy.dangerBar.fillRoundedRect(-width / 2 + 15, height / 2 - 13, width - 30, 5, 3);
    const dangerColor = enemy.danger > 0.76 ? 0xff6072 : enemy.danger > 0.45 ? 0xffb84d : 0x55a8ff;
    enemy.dangerBar.fillStyle(dangerColor, 1);
    enemy.dangerBar.fillRoundedRect(
      -width / 2 + 15,
      height / 2 - 13,
      Math.max(4, (width - 30) * enemy.danger),
      5,
      3,
    );
  }

  private chooseLane(laneCount: number): number {
    const counts = Array.from({ length: laneCount }, () => 0);
    for (const enemy of this.enemies) {
      if (enemy.container.y < 120) counts[enemy.lane] = (counts[enemy.lane] ?? 0) + 1;
    }
    const minimum = Math.min(...counts);
    const candidates = counts
      .map((count, index) => ({ count, index }))
      .filter(({ count }) => count === minimum);
    return candidates[Math.floor(Math.random() * candidates.length)]?.index ?? 0;
  }

  private nextItem(): ShooterItem | undefined {
    if (this.bag.length === 0) {
      this.bag = Phaser.Utils.Array.Shuffle([...this.options.items]);
    }
    let item = this.bag.pop();
    if (item?.base === this.lastBase && this.bag.length > 0) {
      const replacement = this.bag.pop();
      if (replacement) {
        this.bag.unshift(item);
        item = replacement;
      }
    }
    if (item) this.lastBase = item.base;
    return item;
  }

  private lockEnemy(enemy: EnemyEntity, speak: boolean): void {
    if (!this.enemies.includes(enemy)) return;
    for (const entity of this.enemies) {
      entity.locked = entity === enemy;
      this.drawEnemy(entity);
    }
    this.locked = enemy;
    this.bridge.updateFocus(enemy.item);
    if (speak) this.bridge.playAudio(enemy.item.audio);
  }

  private pickMostDangerous(speak: boolean): void {
    const next = [...this.enemies].sort((a, b) => b.container.y - a.container.y)[0];
    if (next) this.lockEnemy(next, speak);
    else {
      this.locked = null;
      this.bridge.updateFocus(null);
    }
  }

  private updateTypedProgress(value: string): void {
    for (const enemy of this.enemies) {
      enemy.progress.setText(
        enemy === this.locked && value
          ? `${value} ${'·'.repeat(Math.max(0, Math.min(22, enemy.item.target.length - value.length)))}`
          : '',
      );
    }
  }

  private hitEnemy(enemy: EnemyEntity): void {
    const index = this.enemies.indexOf(enemy);
    if (index < 0) return;
    this.enemies.splice(index, 1);
    this.locked = null;
    this.fireLaser(enemy.container.x, enemy.container.y);
    this.particles.explode(18, enemy.container.x, enemy.container.y);
    this.cameras.main.shake(110, 0.0035);
    this.tweens.add({
      targets: enemy.container,
      scale: 1.3,
      alpha: 0,
      angle: 24,
      duration: 210,
      ease: 'Quad.easeOut',
      onComplete: () => enemy.container.destroy(true),
    });

    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.killed += 1;
    this.waveKills += 1;
    this.attempts += 1;
    this.score += scoreHit(this.options.mode, this.difficulty, this.combo, this.wave);
    this.bridge.recordAnswer(enemy.item, true);
    this.bridge.clearInput();
    this.updateTypedProgress('');
    this.emitHud();

    if (this.killed >= this.mission.goal) {
      this.finish(true);
      return;
    }
    if (this.waveKills >= this.mission.perWave) {
      this.startWaveBreak();
      return;
    }
    if (this.enemies.length === 0) this.spawnElapsed = Number.POSITIVE_INFINITY;
    this.pickMostDangerous(true);
  }

  private missEnemy(enemy: EnemyEntity): void {
    if (this.locked === enemy) this.locked = null;
    this.particles.explode(12, enemy.container.x, GAME_HEIGHT - 62);
    this.cameras.main.shake(230, 0.009);
    this.tweens.add({
      targets: enemy.container,
      alpha: 0,
      y: GAME_HEIGHT + 40,
      duration: 180,
      onComplete: () => enemy.container.destroy(true),
    });
    this.combo = 0;
    this.shields -= 1;
    this.misses += 1;
    this.attempts += 1;
    this.bridge.recordAnswer(enemy.item, false);
    if (this.enemies.length === 0) this.spawnElapsed = Number.POSITIVE_INFINITY;
    this.emitHud();
    this.pickMostDangerous(true);
    if (this.shields <= 0) this.finish(false);
  }

  private fireLaser(targetX: number, targetY: number): void {
    const laser = this.add.graphics().setDepth(29);
    laser.lineStyle(5, 0xc9eeff, 1);
    laser.lineBetween(this.ship.x, this.ship.y - 24, targetX, targetY);
    laser.lineStyle(12, 0x4ca5ff, 0.22);
    laser.lineBetween(this.ship.x, this.ship.y - 24, targetX, targetY);
    this.tweens.add({
      targets: laser,
      alpha: 0,
      duration: 145,
      onComplete: () => laser.destroy(),
    });
  }

  private startWaveBreak(): void {
    this.roundState = 'break';
    this.waveKills = 0;
    this.wave += 1;
    this.breakMs = 1750;
    this.bridge.setInputEnabled(false);
    this.bridge.clearInput();
    this.bridge.showOverlay(`WAVE ${this.wave}`, '敌机强化，保持节奏');
    for (const enemy of this.enemies) enemy.container.destroy(true);
    this.enemies.length = 0;
    this.locked = null;
    this.bridge.updateFocus(null);
    this.emitHud();
  }

  private finish(won: boolean): void {
    if (this.roundState === 'ending') return;
    this.roundState = 'ending';
    this.bridge.setInputEnabled(false);
    for (const enemy of this.enemies) enemy.container.destroy(true);
    this.enemies.length = 0;
    this.locked = null;
    this.bridge.updateFocus(null);
    this.time.delayedCall(320, () => {
      this.bridge.showResult({
        ...this.hudState(),
        won,
        misses: this.misses,
        maxCombo: this.maxCombo,
      });
    });
  }

  private hudState(): HudState {
    return {
      score: this.score,
      combo: this.combo,
      accuracy: accuracyPercent(this.killed, this.attempts),
      shields: this.shields,
      killed: this.killed,
      goal: this.mission.goal,
      wave: Math.min(this.wave, this.mission.waves),
      waves: this.mission.waves,
      waveProgress: this.waveKills / this.mission.perWave,
    };
  }

  private emitHud(): void {
    this.bridge.updateHud(this.hudState());
  }
}

class TypingShooterController implements TypingShooterHandle {
  private readonly options: TypingShooterOptions;
  private game: Phaser.Game | null = null;
  private scene: ShooterScene | null = null;
  private input: HTMLInputElement | null = null;
  private pauseButton: HTMLButtonElement | null = null;
  private overlay: HTMLElement | null = null;
  private destroyed = false;
  private readonly handleVisibility = (): void => {
    if (document.hidden && this.scene && !this.scene.isPaused()) this.togglePause();
  };

  constructor(options: TypingShooterOptions) {
    this.options = options;
    this.start();
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.game?.destroy(true);
    this.game = null;
    this.scene = null;
    this.options.root.replaceChildren();
  }

  private start(): void {
    this.options.root.innerHTML = `
      <section class="engine-shell" aria-label="Phaser 听写射击任务">
        <div class="engine-hud" id="engineHud"></div>
        <div class="engine-focus" id="engineFocus">
          <span class="engine-reticle">◎</span>
          <span><small>CURRENT TARGET</small><b>准备进入任务区</b></span>
          <em>点击敌机或按 Tab 切换</em>
        </div>
        <div class="engine-stage-wrap">
          <div class="engine-stage" id="engineStage"></div>
          <div class="engine-overlay" id="engineOverlay"><strong>3</strong><span>锁定目标，输入英文</span></div>
        </div>
        <div class="engine-controls">
          <input id="engineInput" aria-label="输入英文答案" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="输入英文答案…">
          <button type="button" id="engineReplay">重听</button>
          <button type="button" id="enginePause">暂停</button>
          <button type="button" id="engineExit">退出</button>
        </div>
        <div class="engine-help"><span><kbd>Tab</kbd> 重听并切换</span><span><kbd>Esc</kbd> 暂停</span><span>黄色锁定 · 红色危险</span></div>
      </section>`;

    const stage = this.requireElement<HTMLElement>('engineStage');
    this.input = this.requireElement<HTMLInputElement>('engineInput');
    this.pauseButton = this.requireElement<HTMLButtonElement>('enginePause');
    this.overlay = this.requireElement<HTMLElement>('engineOverlay');
    const bridge: SceneBridge = {
      updateHud: (state) => this.updateHud(state),
      updateFocus: (item) => this.updateFocus(item),
      showOverlay: (title, subtitle) => this.showOverlay(title, subtitle),
      clearInput: () => {
        if (this.input) {
          this.input.value = '';
          this.input.classList.remove('bad');
        }
      },
      setInputEnabled: (enabled) => {
        if (!this.input) return;
        this.input.disabled = !enabled;
        if (enabled) this.input.focus({ preventScroll: true });
      },
      playAudio: this.options.playAudio,
      recordAnswer: this.options.recordAnswer,
      showResult: (result) => this.showResult(result),
    };

    this.scene = new ShooterScene(this.options, bridge);
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: stage,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: '#050a16',
      scene: this.scene,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
      },
      render: {
        antialias: true,
        roundPixels: false,
      },
      input: {
        keyboard: true,
        mouse: true,
        touch: true,
      },
    };
    this.game = new Phaser.Game(config);
    this.bindControls();
  }

  private bindControls(): void {
    if (!this.input) return;
    this.input.addEventListener('input', () => {
      const result = this.scene?.submitInput(this.input?.value ?? '');
      this.input?.classList.toggle('bad', Boolean(result?.bad));
      if (result?.hit && this.input) this.input.value = '';
    });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        this.scene?.cycleTarget();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.togglePause();
      }
    });
    this.requireElement<HTMLButtonElement>('engineReplay').addEventListener('click', () => {
      this.scene?.replayTarget();
      this.input?.focus({ preventScroll: true });
    });
    this.pauseButton?.addEventListener('click', () => this.togglePause());
    this.requireElement<HTMLButtonElement>('engineExit').addEventListener('click', () =>
      this.options.onExit(),
    );
  }

  private togglePause(): void {
    if (!this.scene) return;
    const nextPaused = !this.scene.isPaused();
    this.scene.setPaused(nextPaused);
    if (this.pauseButton) this.pauseButton.textContent = nextPaused ? '继续' : '暂停';
  }

  private updateHud(state: HudState): void {
    const hud = this.requireElement<HTMLElement>('engineHud');
    hud.innerHTML = `
      <div class="engine-wave"><span>WAVE <b>${state.wave}/${state.waves}</b></span><span>${state.killed}/${state.goal}</span><i><u style="width:${Math.min(100, state.waveProgress * 100)}%"></u></i></div>
      <div><small>SCORE</small><b>${state.score}</b></div>
      <div><small>COMBO</small><b>× ${state.combo}</b></div>
      <div class="optional-stat"><small>ACCURACY</small><b>${state.accuracy}%</b></div>
      <div><small>SHIELD</small><b class="engine-shields">${'●'.repeat(Math.max(0, state.shields))}<span>${'●'.repeat(Math.max(0, 3 - state.shields))}</span></b></div>`;
  }

  private updateFocus(item: ShooterItem | null): void {
    const focus = this.requireElement<HTMLElement>('engineFocus');
    focus.innerHTML = item
      ? `<span class="engine-reticle active">◉</span><span><small>LOCKED · ${item.target.length} CHARACTERS</small><b>${escapeHtml(item.cn)}</b></span><em>Tab 重听 / 切换</em>`
      : '<span class="engine-reticle">◎</span><span><small>CURRENT TARGET</small><b>等待目标进入任务区</b></span><em>点击敌机或按 Tab 切换</em>';
  }

  private showOverlay(title?: string, subtitle?: string): void {
    if (!this.overlay) return;
    if (!title) {
      this.overlay.classList.add('hidden');
      return;
    }
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle ?? '')}</span>`;
  }

  private showResult(result: ResultState): void {
    const best = saveBestScore(this.options.mode, this.options.difficulty, result.score);
    this.options.root.innerHTML = `
      <section class="engine-result">
        <small>${result.won ? 'MISSION COMPLETE' : 'MISSION FAILED'}</small>
        <h2>${result.won ? '四波防守完成' : '护盾失守，再练一次'}</h2>
        <strong>${result.score}</strong>
        <p>${best.isNew ? '新的最高分' : `最高分 ${best.score}`} · ${DIFFICULTIES[this.options.difficulty].label}</p>
        <div class="engine-result-grid">
          <div><b>${result.killed}/${result.goal}</b><span>完成目标</span></div>
          <div><b>${result.accuracy}%</b><span>命中率</span></div>
          <div><b>× ${result.maxCombo}</b><span>最高连击</span></div>
          <div><b>${result.misses}</b><span>漏过目标</span></div>
        </div>
        <div class="rowbtns engine-result-actions"><button class="big" id="engineRestart">再来一局</button><button class="big ghost" id="engineResultExit">返回设置</button></div>
      </section>`;
    this.requireElement<HTMLButtonElement>('engineRestart').addEventListener('click', () => this.restart());
    this.requireElement<HTMLButtonElement>('engineResultExit').addEventListener('click', () =>
      this.options.onExit(),
    );
  }

  private restart(): void {
    this.game?.destroy(true);
    this.game = null;
    this.scene = null;
    this.input = null;
    this.pauseButton = null;
    this.overlay = null;
    this.start();
  }

  private requireElement<T extends HTMLElement>(id: string): T {
    const element = this.options.root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`Typing shooter element #${id} is missing`);
    return element;
  }
}

function saveBestScore(
  mode: GameMode,
  difficulty: DifficultyId,
  score: number,
): { score: number; isNew: boolean } {
  let all: Record<string, number>;
  try {
    all = JSON.parse(localStorage.getItem(BEST_SCORE_KEY) ?? '{}') as Record<string, number>;
  } catch {
    all = {};
  }
  const key = `${mode}-${difficulty}`;
  const previous = all[key] ?? 0;
  if (score > previous) {
    all[key] = score;
    try {
      localStorage.setItem(BEST_SCORE_KEY, JSON.stringify(all));
    } catch {
      // The game still works when storage is unavailable.
    }
    return { score, isNew: true };
  }
  return { score: previous, isNew: false };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ??
      character,
  );
}

export function mountTypingShooter(options: TypingShooterOptions): TypingShooterHandle {
  return new TypingShooterController(options);
}
