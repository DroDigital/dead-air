/**
 * App controller: owns the FSM, the Game, the Stage, audio and UI. The rules core runs
 * instantly; this layer replays results as animations, captions and sound.
 */
import { Assets } from './assets/loader';
import { Mixer } from './audio/mixer';
import { Music } from './audio/music';
import { Sfx } from './audio/sfx';
import { HOST_VOICE, PRODUCER_VOICE, SECRET_VOICE, Voice } from './audio/voice';
import { artifactDef } from './content/artifacts';
import { bargainDef, fillDeal } from './content/bargains';
import { COMBO_NAMES } from './game/combos';
import { HOST_LINES, HOST_SILENT_LINES, type HostTrigger } from './content/hostLines';
import { mutatorDef } from './content/mutators';
import { scratchDef } from './content/scratchCards';
import { WEDGES } from './content/wedges';
import { defaultSettings, sanitizeSettings, SETTINGS_VERSION, type Settings } from './core/config';
import { APP_TRANSITIONS, Fsm, type AppState } from './core/fsm';
import { META_MIGRATIONS, RUN_MIGRATIONS, SAVE_KEYS, SaveSlot, defaultStorage } from './core/save';
import { BALANCE } from './game/balance';
import { META_VERSION, applyRun, computeRatings, endlessUnlocked, newMeta, noteRunProgress, unlockedArtifacts, unlockedWedges, type MetaState } from './game/meta';
import { Game, RUN_VERSION, type DeadlineEndResult, type SpinOutcome, type SpinResolution } from './game/run';
import { sellValue } from './game/shop';
import type { PackageId, RunState } from './game/types';
import { angleForSegment, meterValue } from './game/wheel';
import { CabinetView, type ServiceButton } from './render/scene/cabinet';
import { buildProp } from './render/scene/props';
import { Stage } from './render/stage';
import { Hud, type ChoicePanel } from './ui/hud';
import { Input, type Action } from './ui/input';
import { Menus } from './ui/menus';
import { segmentLabel, tooltipFor, uvToLocalAngle } from './ui/tooltips';
import { segmentAt } from './game/wheel';
import * as THREE from 'three';

type TargetMode = 'replace' | 'remove' | 'gild' | 'widen' | 'narrow';

const wait = (s: number) => new Promise<void>((r) => setTimeout(r, s * 1000));

export class App {
  readonly assets = new Assets();
  stage!: Stage;
  readonly mixer = new Mixer();
  readonly sfx = new Sfx(this.mixer);
  readonly music = new Music(this.mixer);
  readonly voice = new Voice(this.mixer);
  readonly hud = new Hud();
  input!: Input;
  menus!: Menus;
  readonly fsm = new Fsm<AppState>('Boot', APP_TRANSITIONS, false);
  game: Game | null = null;
  meta: MetaState;
  settings: Settings;
  private storage = defaultStorage();
  private runSlot = new SaveSlot<RunState>(SAVE_KEYS.run, RUN_VERSION, RUN_MIGRATIONS, this.storage);
  private metaSlot = new SaveSlot<MetaState>(SAVE_KEYS.meta, META_VERSION, META_MIGRATIONS, this.storage);
  private settingsSlot = new SaveSlot<Settings>(SAVE_KEYS.settings, SETTINGS_VERSION, {}, this.storage);
  private busy = 0;
  private loading = 0;
  private time = 0;
  private hitstop = 0;
  private charge: { t: number; peek: boolean; lastTick: number } | null = null;
  private target: { mode: TargetMode; idx: number } | null = null;
  private shopSel = 0;
  private convertN = 0;
  private choiceSel = 0;
  private choiceHandler: ((i: number) => void) | null = null;
  private choiceBack: (() => void) | null = null;
  private pendingEnds: DeadlineEndResult[] = [];
  private introShownFor = -1;
  private layoutSig = '';
  private phoneAnswered = false;
  private idleTimer = 0;
  private replaceAfterPick: string | null = null;
  private sellArmed = -1;
  private iconCache = new Map<string, string>();
  private lastFrame = performance.now();
  private debug = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.meta = this.metaSlot.load() ?? newMeta();
    this.settings = sanitizeSettings(this.settingsSlot.load() ?? defaultSettings());
  }

  // ===================================================================================
  // Boot
  // ===================================================================================
  async boot(): Promise<void> {
    this.input = new Input(this.canvas);
    this.menus = new Menus({
      onContinue: () => void this.continueRun(),
      onNewRun: (c) => void this.newRun(c.seed, c.stake, c.startWheel),
      onResume: () => this.resume(),
      onAbandon: () => this.abandon(),
      onQuitToTitle: () => this.quitToTitle(),
      onSettings: (s) => this.applySettings(s),
      onEndlessContinue: () => this.endlessContinue(),
      onRetire: () => this.retire(),
      onUiSound: (k) => this.sfx.play(k === 'select' ? 'button' : 'blip', { gain: 0.5 }),
      getMeta: () => this.meta,
      getSettings: () => this.settings,
      hasSave: () => this.runSlot.exists() && !!this.runSlot.load(),
      artifactIcon: (id) => this.artifactIcon(id),
    });
    const firstGesture = () => {
      void this.mixer.resume().then(() => {
        this.music.startAmbience();
        this.mixer.setVolumes(this.settings);
      });
      window.removeEventListener('pointerdown', firstGesture);
      window.removeEventListener('keydown', firstGesture);
    };
    window.addEventListener('pointerdown', firstGesture);
    window.addEventListener('keydown', firstGesture);

    // Diegetic loading screen: a 2D pixel canvas (studio lights powering on one by one).
    const lc = document.createElement('canvas');
    lc.id = 'loading';
    lc.width = 320;
    lc.height = 180;
    document.body.appendChild(lc);
    const lctx = lc.getContext('2d')!;
    let loadingDone = false;
    const loop = (t: number) => {
      if (loadingDone) return;
      this.hud.drawLoading(lctx, 320, 180, 1, this.loading, t / 1000);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    await this.assets.preload((p) => {
      this.loading = p;
      this.sfx.play('powerup', { gain: 0.15, pitch: 0.8 + p * 0.6 });
    });
    await this.sfx.loadFiles();
    this.loading = 1;
    await wait(0.3);
    loadingDone = true;
    lc.parentElement?.removeChild(lc);
    this.buildStage();
    this.wireInput();
    window.addEventListener('resize', () => this.stage.resize());
    this.applySettings(this.settings);
    requestAnimationFrame((t) => this.frame(t));
    await this.powerOn();
    this.fsm.go('Menu');
    this.menus.show('title');
    if (new URLSearchParams(location.search).has('debug')) this.debug = true;
  }

  private buildStage(): void {
    this.stage = new Stage(this.canvas, this.assets);
    const st = this.stage;
    st.tray.onCoinLand = () => this.sfx.play('clink', { gain: 0.25, pitch: 1 + Math.random() * 0.3 });
    st.vault.onTick = () => this.sfx.play('nixie', { gain: 0.25 });
    st.rig.onMove = () => this.sfx.play('whoosh', { gain: 0.12, pitch: 1.3 });
    st.wheel.setLayout(this.demoLayout(), [1, 2, 1, 0, 1, 3, 1, 2], (s) => (s.kind === 'cash' ? `$${s.value}` : WEDGES[s.kind].glyph));
  }

  private demoLayout() {
    const g = Game.newRun({ seed: 'TITLE', stake: 0, startWheel: 'standard' });
    return g.layout();
  }

  /** Studio lights power on one by one. */
  private async powerOn(): Promise<void> {
    const st = this.stage;
    st.studio.lightLevel = 0;
    st.studio.spotLevel = 0;
    st.wheel.bulbsOn = 0;
    st.host.expression = 'static';
    const steps: [() => void, number][] = [
      [() => (st.studio.lightLevel = 0.35), 0.35],
      [() => (st.studio.lightLevel = 1), 0.3],
      [() => (st.studio.spotLevel = 1), 0.35],
      [() => (st.wheel.bulbsOn = 1), 0.3],
      [() => (st.host.expression = 'smile'), 0.2],
    ];
    for (const [fn, d] of steps) {
      fn();
      this.sfx.play('powerup', { gain: 0.4 });
      await wait(d);
    }
  }

  // ===================================================================================
  // Settings / meta
  // ===================================================================================
  applySettings(s: Settings): void {
    this.settings = sanitizeSettings(s);
    this.settingsSlot.save(this.settings);
    if (!this.stage) return;
    this.stage.setScale(this.settings.resolutionScale);
    this.stage.post.crt = this.settings.crt;
    this.stage.post.dither = this.settings.dither;
    this.stage.setWarp(this.settings.warp);
    this.stage.vfx.reducedFlashing = this.settings.reducedFlashing;
    this.stage.marquee.reduced = this.settings.reducedFlashing;
    this.stage.wheel.setColorblind(this.settings.colorblind);
    this.hud.fastMode = this.settings.fastMode;
    this.mixer.setVolumes(this.settings);
    this.layoutSig = '';
    if (this.game) this.sync(false);
  }

  get speed(): number {
    return this.settings.fastMode ? 3 : 1;
  }

  private saveMeta(): void {
    this.metaSlot.save(this.meta);
  }

  private artifactIcon(id: string): string | null {
    if (this.iconCache.has(id)) return this.iconCache.get(id)!;
    try {
      const def = artifactDef(id);
      const scene = new THREE.Scene();
      const prop = buildProp(def.prop, def.color, this.assets);
      scene.add(prop);
      const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 5);
      cam.position.set(0.18, 0.2, 0.32);
      cam.lookAt(0, 0.06, 0);
      const rt = new THREE.WebGLRenderTarget(48, 48);
      const r = this.stage.renderer;
      r.setRenderTarget(rt);
      r.setClearColor(0x1a120c, 1);
      r.clear();
      r.render(scene, cam);
      const px = new Uint8Array(48 * 48 * 4);
      r.readRenderTargetPixels(rt, 0, 0, 48, 48, px);
      r.setRenderTarget(null);
      rt.dispose();
      const cv = document.createElement('canvas');
      cv.width = cv.height = 48;
      const ctx = cv.getContext('2d')!;
      const img = ctx.createImageData(48, 48);
      for (let y = 0; y < 48; y++) img.data.set(px.subarray((47 - y) * 48 * 4, (48 - y) * 48 * 4), y * 48 * 4);
      ctx.putImageData(img, 0, 0);
      const url = cv.toDataURL();
      this.iconCache.set(id, url);
      return url;
    } catch {
      return null;
    }
  }

  // ===================================================================================
  // Run lifecycle
  // ===================================================================================
  private attach(g: Game): void {
    this.game = g;
    this.introShownFor = -1;
    this.pendingEnds = [];
    this.layoutSig = '';
    g.bus.on('changed', () => {
      if (!this.game) return;
      noteRunProgress(this.meta, this.game.run);
      if (this.game.run.phase === 'GameOver') return;
      this.runSlot.save(this.game.snapshot());
    });
    g.bus.on('deadlineEnd', (e) => this.pendingEnds.push(e));
    g.bus.on('trigger', (t) => {
      this.stage.shelf.trigger(t.slot);
      this.sfx.play('blip', { pitch: 1.4 + t.slot * 0.1, gain: 0.4 });
      this.stage.vfx.float(this.stage.shelf.slotWorld(t.slot), t.text, '#ffd040');
    });
    g.bus.on('phone', () => {
      this.phoneAnswered = false;
    });
    g.bus.on('artifactGained', (e) => {
      if (this.game && this.game.run.artifacts.length >= BALANCE.maxArtifacts) this.game.run.marks.fullShelf = 1;
      this.sfx.play('pickup', { gain: 0.5 });
      void e;
    });
    this.music.setDeadline(g.run.deadline);
    this.music.start();
    this.music.setLevel(1);
    this.stage.studio.openTrapdoor(0);
    this.stage.host.silent = !!g.run.marks.hostSilent;
    this.stage.tray.setAmount(g.run.tray, false);
    this.stage.vault.setVault(g.run.vault, true);
    this.sync(false);
  }

  async newRun(seed: string, stake: number, startWheel: string): Promise<void> {
    this.menus.hide();
    const g = Game.newRun({
      seed,
      stake,
      startWheel,
      unlockedArtifacts: unlockedArtifacts(this.meta),
      unlockedWedges: unlockedWedges(this.meta),
    });
    this.meta.lastSeed = seed;
    this.saveMeta();
    this.attach(g);
    this.runSlot.save(g.snapshot());
    this.stage.rig.go('center', 0.6);
    await this.enterPhase();
  }

  async continueRun(): Promise<void> {
    const st = this.runSlot.load();
    if (!st) return;
    this.menus.hide();
    this.attach(Game.fromState(st));
    this.introShownFor = this.game!.run.deadline;
    await this.enterPhase();
  }

  private resume(): void {
    this.menus.hide();
    this.input.clear();
  }

  private quitToTitle(): void {
    if (this.game && this.game.run.phase !== 'GameOver' && !this.game.run.marks.metaApplied) this.runSlot.save(this.game.snapshot());
    this.game = null;
    this.hud.choice = null;
    this.hud.ticker = '';
    this.hud.hint = '';
    this.choiceHandler = null;
    this.stage.phone.ringing = false;
    this.sfx.stopRinging();
    this.stage.post.roll = 0;
    this.fsm.force('Menu');
    this.menus.show('title');
  }

  private abandon(): void {
    if (!this.game) return;
    const r = this.game.run;
    r.endedAt = r.deadline;
    const res = applyRun(this.meta, r);
    this.saveMeta();
    this.runSlot.clear();
    this.game = null;
    this.fsm.force('Menu');
    this.menus.showSummary(false, r.deadline, res.ratings, res.newUnlocks, false);
  }

  private endlessContinue(): void {
    if (!this.game) return;
    this.menus.hide();
    this.game.continueEndless();
    void this.enterPhase();
  }

  private retire(): void {
    if (!this.game) return;
    const r = this.game.run;
    if (!r.marks.metaApplied) {
      r.marks.metaApplied = 1;
      applyRun(this.meta, r);
      this.saveMeta();
    }
    this.runSlot.clear();
    this.quitToTitle();
  }

  // ===================================================================================
  // Presentation helpers
  // ===================================================================================
  private hostSay(trigger: HostTrigger, face: Parameters<Stage['host']['say']>[0] = 'talk', pose?: Parameters<Stage['host']['setPose']>[0]): void {
    const silent = !!this.game?.run.marks.hostSilent;
    const pool = silent ? HOST_SILENT_LINES : HOST_LINES[trigger];
    const line = pool[Math.floor(Math.random() * pool.length)];
    const dur = silent ? 1.5 : this.voice.speak(line, HOST_VOICE, this.speed > 1 ? 1.4 : 1);
    this.stage.host.say(face, dur);
    if (pose) this.stage.host.setPose(pose);
    if (this.settings.captions) this.hud.caption('HOST', line, '#7dffa8', dur / (this.speed > 1 ? 1.5 : 1));
  }

  private producerSay(text: string, secret: boolean): number {
    const dur = this.voice.speak(text, secret ? SECRET_VOICE : PRODUCER_VOICE, 1.2);
    if (this.settings.captions) this.hud.caption(secret ? '???' : 'THE PRODUCER', text, secret ? '#c080ff' : '#ff9060', dur);
    return dur;
  }

  private ticker(): void {
    const g = this.game;
    if (!g) return;
    const r = g.run;
    const d = r.deadline > BALANCE.deadlinesPerRun ? `∞${r.deadline}` : `${r.deadline}/8`;
    this.hud.ticker = `D${d}  SPINS ${r.spinsLeft}  TRAY $${r.tray} ×${r.streak.toFixed(2)}  VAULT $${r.vault}/${r.debt}`;
    this.hud.tickerRight = '';
    this.hud.corner = `TOK ${r.tokens}`;
  }

  /** Push the current run state to every view. */
  private sync(pour: boolean): void {
    const g = this.game;
    if (!g) return;
    const r = g.run;
    const st = this.stage;
    const L = g.layout();
    const ring = g.effectiveRing();
    const sig = JSON.stringify([L.segments.map((s) => [s.kind, s.start.toFixed(2), Math.round(g.cashValueOf(s)), s.gild, s.overridden]), ring, this.settings.colorblind]);
    if (sig !== this.layoutSig) {
      this.layoutSig = sig;
      st.wheel.setLayout(L, ring, (s) => segmentLabel(g, s));
    }
    st.wheel.streak = r.streak;
    st.tray.setStreak(r.streak, r.tray);
    st.tray.setAmount(r.tray, pour);
    st.vault.setVault(r.vault);
    st.vault.setCards(
      r.scratch,
      r.scratch.map((_, i) => g.canUseScratch(i)),
    );
    st.shelf.setArtifacts(r.artifacts);
    st.cabinet.setShop(r.shop, r.tokens, (c) => r.tokens >= c);
    st.cabinet.setDebt(r.spinsLeft, r.debt, r.vault, r.deadline, r.mutator);
    st.cabinet.dripping = r.phase === 'AwaitAction' && r.spinsLeft <= 2 && r.vault + r.tray < r.debt ? 1 : 0;
    st.host.silent = !!r.marks.hostSilent;
    this.ticker();
    if (!this.charge) {
      const ch = r.phase === 'AwaitAction' ? g.chargeContext() : null;
      st.lever.drawGauge(0, BALANCE.sweetCenter, ch?.sweetHalfWidth ?? BALANCE.sweetHalfWidth, false, !!ch?.preview, r.phase === 'AwaitAction' ? `${r.spinsLeft} LEFT` : '---');
    }
    this.updateArrows();
  }

  private updateArrows(): void {
    const nav = { center: ['down', 'left', 'right'], down: ['up', 'left', 'right'], left: ['right', 'down'], right: ['left', 'down'] } as const;
    this.hud.arrows = this.game && !this.charge && !this.target ? [...nav[this.stage.rig.station]] : [];
  }

  private setChoice(panel: ChoicePanel | null, handler: ((i: number) => void) | null, back: (() => void) | null = null): void {
    this.hud.choice = panel;
    this.choiceHandler = handler;
    this.choiceBack = back;
    this.choiceSel = panel?.selected ?? 0;
    this.updateArrows();
  }

  private async withBusy<T>(fn: () => Promise<T>): Promise<T> {
    this.busy++;
    try {
      return await fn();
    } finally {
      this.busy--;
    }
  }

  // ===================================================================================
  // Phase entry: set up the UI for whatever the rules core is waiting on
  // ===================================================================================
  private async enterPhase(): Promise<void> {
    const g = this.game;
    if (!g) return;
    // Any deadline endings first.
    while (this.pendingEnds.length) await this.presentDeadlineEnd(this.pendingEnds.shift()!);
    if (!this.game) return;
    const r = g.run;
    this.sync(false);
    this.target = null;
    this.hud.hint = '';
    this.stage.phone.ringing = r.phase === 'PhoneCall' && !this.phoneAnswered;
    switch (r.phase) {
      case 'PackageSelect':
        if (this.introShownFor !== r.deadline) await this.deadlineIntro();
        this.fsm.force('PackageSelect');
        this.showPackages();
        break;
      case 'AwaitAction':
        this.fsm.force('AwaitAction');
        this.setChoice(null, null);
        this.hud.hint = this.stage.rig.station === 'center' ? 'HOLD SPACE (OR THE LEVER) TO SPIN' : '';
        break;
      case 'Nudge':
        this.fsm.force('Resolving');
        this.showNudge();
        break;
      case 'ArtifactPick':
        this.fsm.force('Resolving');
        this.showArtifactPick();
        break;
      case 'WedgeReplace':
        this.fsm.force('Shop');
        this.beginTarget('replace');
        break;
      case 'Conversion':
        this.fsm.force('Conversion');
        this.showConversion();
        break;
      case 'Shop':
        this.fsm.force('Shop');
        this.setChoice(null, null);
        this.stage.rig.go('right');
        this.hud.hint = '1-6 BUY · R REROLL · X/G/+/- SERVICES · N DONE';
        break;
      case 'PhoneCall':
        this.fsm.force('PhoneCall');
        await this.phoneRing();
        break;
      case 'GameOver':
        await this.gameOver();
        break;
      case 'Victory':
        await this.victory();
        break;
    }
  }

  private async deadlineIntro(): Promise<void> {
    const g = this.game!;
    const r = g.run;
    this.introShownFor = r.deadline;
    await this.withBusy(async () => {
      this.fsm.force('DeadlineIntro');
      this.music.setDeadline(r.deadline);
      this.stage.rig.go('center', 0.5);
      const mut = mutatorDef(r.mutator);
      const title = r.deadline > BALANCE.deadlinesPerRun ? `ENDLESS ${r.deadline}` : `DEADLINE ${r.deadline}`;
      this.hud.showBanner(title, `THE NETWORK WANTS $${r.debt}`, mut ? '#ff5040' : '#ffd040', 2.6 / this.speed);
      this.stage.marquee.set(`DEADLINE ${r.deadline} — $${r.debt} DUE`, '#ffd040', true);
      this.sfx.play('sting', { gain: 0.6 });
      this.hostSay(r.deadline === 1 ? 'intro' : mut ? 'sweep' : 'package', 'grin', 'present');
      await wait(1.6 / this.speed);
      if (mut) {
        this.hud.showBanner(`SWEEPS: ${mut.name}`, mut.text, '#ff5040', 3 / this.speed);
        this.stage.post.roll = 0.6;
        this.sfx.play('buzz', { gain: 0.4 });
        await wait(1.8 / this.speed);
        this.stage.post.roll = 0;
      }
      this.stage.host.setPose('idle');
    });
  }

  private showPackages(): void {
    const g = this.game!;
    const ids: PackageId[] = ['short', 'standard', 'marathon'];
    const names = { short: 'SHORT', standard: 'STANDARD', marathon: 'MARATHON' };
    const blurbs = {
      short: 'A quick one. Leave with pocket money for the Cabinet.',
      standard: 'The regular broadcast.',
      marathon: 'Long night. One random wedge turns BANKRUPT for this Deadline.',
    };
    this.setChoice(
      {
        title: `CHOOSE YOUR BROADCAST — DUE $${g.run.debt}`,
        lines: [mutatorDef(g.run.mutator) ? `SWEEPS: ${mutatorDef(g.run.mutator)!.text}` : `VAULT $${g.run.vault} · TOKENS ${g.run.tokens}`],
        options: ids.map((id) => ({
          label: names[id],
          detail: `${g.spinsForPackage(id)} SPINS · +${g.tokensForPackage(id)} TOKENS. ${blurbs[id]}`,
          color: id === 'marathon' ? '#ff8060' : '#ffffff',
        })),
        selected: 1,
        footer: '1-3 OR CLICK · ←/→ + ENTER',
      },
      (i) => {
        const pkg = ids[i];
        if (!pkg) return;
        this.setChoice(null, null);
        g.choosePackage(pkg);
        this.sfx.play('button');
        this.hostSay('package', 'talk', 'point');
        this.layoutSig = '';
        void this.enterPhase();
      },
    );
  }

  // ===================================================================================
  // Spinning
  // ===================================================================================
  private startCharge(): void {
    const g = this.game;
    if (!g || g.run.phase !== 'AwaitAction' || this.busy || this.charge || this.menus.open) return;
    if (this.stage.rig.station !== 'center') this.stage.rig.go('center');
    this.charge = { t: 0, peek: false, lastTick: 0 };
    this.fsm.force('Charging');
    this.hud.hint = g.canPeek() ? 'RELEASE IN THE GREEN · [E] PEEK' : 'RELEASE IN THE GREEN';
    this.updateArrows();
  }

  private async releaseCharge(): Promise<void> {
    const g = this.game;
    const c = this.charge;
    if (!g || !c) return;
    this.charge = null;
    const power = meterValue(c.t);
    this.stage.lever.pull = 0;
    this.stage.wheel.showHighlight(null);
    this.hud.hint = '';
    await this.doSpin(power, c.peek);
  }

  private async doSpin(power: number, peek: boolean): Promise<void> {
    const g = this.game!;
    await this.withBusy(async () => {
      this.fsm.force('Spinning');
      this.hud.payout = null;
      const outcome = g.spin(power, { peek });
      this.sfx.play('lever', { gain: 0.8 });
      this.stage.lever.pull = 1;
      setTimeout(() => (this.stage.lever.pull = 0), 250);
      this.stage.marquee.set(outcome.sweet ? 'SWEET SPOT!' : outcome.locked ? 'LOCKED!' : 'SPINNING…', outcome.sweet ? '#60ff80' : '#ffe060');
      if (outcome.sweet) this.sfx.play('blip', { pitch: 2, gain: 0.5 });
      // Wheel layout at spin time (Static jackpots etc. are already visible).
      this.stage.wheel.setLayout(outcome.layout, outcome.ring, (s) => segmentLabel(g, s));
      this.layoutSig = '';
      await this.stage.wheel.playTrace(outcome.sim.trace, {
        hang: outcome.sim.hang,
        onTick: (t) => {
          this.sfx.tick(t.speed);
          this.stage.wheel.kickFlapper();
        },
      });
      this.fsm.force('Resolving');
      this.stage.wheel.showHighlight(outcome.sim.outerIndex, 0xffffff, 0.3);
      if (!outcome.resolution) {
        this.sync(false);
        return;
      }
      await this.presentResolution(outcome, outcome.resolution);
    });
    await this.enterPhase();
  }

  private showNudge(): void {
    const g = this.game!;
    const ps = g.run.pendingSpin!;
    const L = g.layout();
    const n = L.segments.length;
    const name = (i: number) => {
      const s = L.segments[(i + n) % n];
      return `${WEDGES[s.kind].name}${s.kind === 'cash' ? ` $${Math.round(g.cashValueOf(s))}` : ''}`;
    };
    this.setChoice(
      {
        title: 'NUDGE?',
        options: [
          { label: '← NUDGE BACK', detail: name(ps.outerIndex - 1) },
          { label: 'LEAVE IT', detail: name(ps.outerIndex) },
          { label: 'NUDGE ON →', detail: name(ps.outerIndex + 1) },
        ],
        selected: 1,
        footer: '←/→ + ENTER',
      },
      (i) => void this.nudge((i - 1) as -1 | 0 | 1),
    );
  }

  private async nudge(dir: -1 | 0 | 1): Promise<void> {
    const g = this.game!;
    this.setChoice(null, null);
    await this.withBusy(async () => {
      const L = g.layout();
      const target = dir === 0 ? null : angleForSegment(L, (g.run.pendingSpin!.outerIndex + dir + L.segments.length) % L.segments.length);
      const res = g.chooseNudge(dir);
      if (target !== null) {
        this.sfx.play('ratchet', { gain: 0.6 });
        await this.stage.wheel.rotateTo(target, 0.6);
      }
      this.stage.wheel.showHighlight(res.segIdx, 0xffffff, 0.3);
      await this.presentResolution(null, res);
    });
    await this.enterPhase();
  }

  /** Marquee count-up, triggers, coins, combos, bankrupt drama. */
  private async presentResolution(outcome: SpinOutcome | null, res: SpinResolution): Promise<void> {
    const g = this.game!;
    const st = this.stage;
    const p = res.payout;
    const sp = this.speed;
    const steps = p.steps.filter((s) => !s.label.startsWith('='));
    // Step-by-step marquee with rising pitch.
    let acc = '';
    for (let i = 0; i < steps.length; i++) {
      acc = acc ? `${acc} → ${steps[i].label}` : steps[i].label;
      const isCombo = steps[i].op === 'combo';
      st.marquee.set(steps[i].label.slice(0, 21), isCombo ? '#ff70ff' : '#ffe060', isCombo);
      this.hud.payout = { text: acc, color: '#ffe8a0' };
      this.sfx.play(isCombo ? 'sting' : 'blip', { pitch: 1 + i * 0.12, gain: isCombo ? 0.5 : 0.35 });
      if (steps[i].slot !== undefined) st.shelf.trigger(steps[i].slot!);
      await wait((isCombo ? 0.45 : 0.28) / sp);
    }
    if (p.cash > 0 || p.isCash) {
      // Count up the final number.
      const n = Math.max(6, Math.min(20, Math.round(Math.log2(p.cash + 2) * 2)));
      for (let k = 1; k <= n; k++) {
        st.marquee.set(`= $${Math.round((p.cash * k) / n)}`, '#80ff80');
        this.hud.payout = { text: `${acc} = $${Math.round((p.cash * k) / n)}`, color: '#c0ffc0' };
        this.sfx.play('nixie', { pitch: 0.8 + (k / n) * 1.4, gain: 0.4 });
        await wait(0.035 / sp);
      }
    } else st.marquee.set(p.marquee.length > 30 ? p.marquee.slice(0, 30) : p.marquee, '#ffe060');
    for (const c of res.combos) {
      if (c === 'deadAir') continue;
      st.vfx.float(st.wheel.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)), COMBO_NAMES[c], '#ff70ff', 2, 1.6);
    }
    if (res.combos.some((c) => c !== 'deadAir') && Math.random() < 0.5) this.hostSay('combo', 'grin', 'cheer');

    // Notes (prize effects).
    for (const n of res.notes.slice(0, 4)) this.hud.toast(n);

    const big = p.cash >= Math.max(500, g.run.debt * 0.5);
    if (p.bankrupt && !p.bankruptBlocked) await this.bankruptDrama(p.trayLost, p.deadAir);
    else if (p.bankruptBlocked) {
      this.hud.toast('BANKRUPT BLOCKED!', '#80ffff');
      this.sfx.play('thunk', { gain: 0.6, pitch: 1.4 });
    }
    if (p.cash > 0) {
      if (big) {
        this.hitstop = 0.18;
        if (this.settings.screenShake) st.rig.shake(0.5);
        this.sfx.play('cheer', { gain: 0.6 });
      }
      this.sfx.play('cascade', { gain: Math.min(1, 0.3 + p.cash / 1500), pitch: 1 });
    }
    if (p.resolvedKind === 'jackpot' || p.landedKind === 'jackpot') {
      this.sfx.play('jackpot', { gain: 0.8 });
      if (!this.settings.reducedFlashing) st.vfx.confetti(st.post.width, 100);
      st.studio.accent.color.setRGB(1.2, 1.0, 0.3);
      st.studio.accent.pos.set(0, 2.5, 0.5);
      setTimeout(() => st.studio.accent.color.setRGB(0, 0, 0), 1500);
      this.hostSay('jackpot', 'shock', 'cheer');
    } else if (big) this.hostSay('bigWin', 'grin', 'cheer');
    else if (p.landedKind === 'dud' && Math.random() < 0.5) this.hostSay('dud', 'wink', 'shrug');
    else if (p.landedKind === 'tax') this.hostSay('tax', 'grin', 'point');
    else if (p.landedKind === 'mystery' && Math.random() < 0.4) this.hostSay('mystery', 'talk', 'present');
    else if (p.landedKind === 'artifact') this.hostSay('artifact', 'grin', 'present');
    else if (g.run.streak >= 2 && Math.random() < 0.35) this.hostSay('streak', 'grin', 'point');
    this.sync(true);

    // Ring Jump: the inner ring spins again and the last wedge pays again.
    if (res.ringJump) {
      st.marquee.set('RING JUMP!', '#c080ff', true);
      await st.wheel.playRingTrace(res.ringJump.trace, 1 / 60);
      if (res.ringJump.payout) {
        st.marquee.set(res.ringJump.payout.marquee.slice(0, 30), '#c0a0ff', true);
        if (res.ringJump.payout.cash > 0) this.sfx.play('cascade', { gain: 0.5 });
        await wait(0.6 / sp);
      }
      this.sync(true);
    }
    void outcome;
    await wait(0.35 / sp);
    st.wheel.showHighlight(null);
  }

  private async bankruptDrama(lost: number, deadAir: boolean): Promise<void> {
    const st = this.stage;
    this.sfx.play('bankrupt', { gain: 0.9 });
    if (this.settings.screenShake) st.rig.shake(1);
    // Lights out for half a second (a gentle dim with Reduced Flashing).
    st.studio.lightLevel = this.settings.reducedFlashing ? 0.45 : 0;
    st.wheel.bulbsOn = this.settings.reducedFlashing ? 0.4 : 0;
    this.mixer.setMuffle(0.6);
    st.tray.setAmount(0, false);
    this.music.setLevel(0.2);
    await wait(0.5);
    st.studio.lightLevel = 1;
    st.wheel.bulbsOn = 1;
    st.studio.swingBulb(0.5);
    this.mixer.setMuffle(0);
    this.music.setLevel(1, 2);
    this.sfx.play('groan', { gain: 0.6 });
    if (lost > 0) st.vfx.float(st.tray.group.position.clone().add(new THREE.Vector3(0, 0.4, 0)), `-$${lost}`, '#ff4040', 1, 1.8);
    st.marquee.set(deadAir ? 'DEAD AIR' : 'BANKRUPT', '#ff3020', true);
    this.hostSay('bankrupt', 'grin', 'shrug');
    if (deadAir) {
      this.stage.post.roll = 1;
      await wait(0.8);
    }
  }

  // ===================================================================================
  // Choices: artifact pick, conversion, phone
  // ===================================================================================
  private showArtifactPick(): void {
    const g = this.game!;
    const p = g.run.pending;
    if (!p || p.type !== 'artifactPick') return;
    const full = g.run.artifacts.length >= BALANCE.maxArtifacts;
    this.setChoice(
      {
        title: 'A PRIZE FROM THE PROP ROOM — PICK ONE',
        lines: full ? ['YOUR SHELF IS FULL: PICKING WILL REPLACE AN ARTIFACT.'] : [],
        options: [
          ...p.options.map((id) => {
            const d = artifactDef(id);
            return { label: d.name.toUpperCase(), detail: `(${d.rarity.toUpperCase()}) ${d.text}`, color: d.rarity === 'cursed' ? '#c080ff' : d.rarity === 'rare' ? '#ffd040' : d.rarity === 'uncommon' ? '#80d0ff' : '#ffffff' };
          }),
          { label: 'SKIP', detail: 'Leave them on the shelf.' },
        ],
        selected: 0,
        layout: 'cards',
        footer: '1-4 OR CLICK',
      },
      (i) => {
        if (i >= p.options.length) {
          this.setChoice(null, null);
          g.pickArtifact(null);
          void this.enterPhase();
          return;
        }
        const id = p.options[i];
        if (full) {
          this.replaceAfterPick = id;
          this.showReplaceSlot();
          return;
        }
        this.setChoice(null, null);
        g.pickArtifact(id);
        this.sfx.play('pickup');
        this.hostSay('artifact', 'grin', 'present');
        void this.enterPhase();
      },
    );
  }

  private showReplaceSlot(): void {
    const g = this.game!;
    this.setChoice(
      {
        title: 'WHICH ARTIFACT GOES IN THE BIN?',
        options: g.run.artifacts.map((a, i) => ({ label: `${i + 1} ${artifactDef(a.id).name.toUpperCase()}`, detail: artifactDef(a.id).rarity.toUpperCase() })),
        selected: 0,
        layout: 'list',
        footer: '1-6 · BACKSPACE TO GO BACK',
      },
      (i) => {
        this.setChoice(null, null);
        g.pickArtifact(this.replaceAfterPick, i);
        this.replaceAfterPick = null;
        void this.enterPhase();
      },
      () => this.showArtifactPick(),
    );
  }

  private showConversion(): void {
    const g = this.game!;
    const max = g.maxConvertible();
    this.convertN = Math.min(this.convertN, max);
    const n = this.convertN;
    const interest = g.interestPreview(n);
    this.setChoice(
      {
        title: 'PAYMENT RECEIVED — WHAT ABOUT THE SURPLUS?',
        lines: [
          `VAULT $${g.run.vault}. CONVERT AT $${BALANCE.tokenRate} PER TOKEN, OR LET IT EARN ${Math.round(BALANCE.interestRate * 100)}% (CAP $${BALANCE.interestCap(g.run.deadline)}).`,
          `CONVERT ${n} → +${n} TOK · KEEP $${g.run.vault - n * BALANCE.tokenRate} → +$${interest} INTEREST`,
        ],
        options: [
          { label: '− 1 TOKEN', disabled: n <= 0 },
          { label: '+ 1 TOKEN', disabled: n >= max },
          { label: max > 0 ? `ALL (${max})` : 'NONE', detail: '' },
          { label: 'CONFIRM', color: '#80ff80' },
        ],
        selected: 3,
        layout: 'list',
        footer: '←/→ ADJUST · ENTER CONFIRM',
      },
      (i) => {
        if (i === 0) this.convertN = Math.max(0, n - 1);
        else if (i === 1) this.convertN = Math.min(max, n + 1);
        else if (i === 2) this.convertN = this.convertN === max ? 0 : max;
        else {
          this.setChoice(null, null);
          const res = g.convert(n);
          if (res.tokens) this.hud.toast(`+${res.tokens} TOKENS`);
          if (res.interest) this.hud.toast(`+$${res.interest} INTEREST`, '#80ff80');
          this.sfx.play('thunk');
          this.convertN = 0;
          this.hostSay('shop', 'grin', 'present');
          void this.enterPhase();
          return;
        }
        this.sfx.play('blip');
        this.showConversion();
      },
    );
  }

  private async phoneRing(): Promise<void> {
    const g = this.game!;
    if (this.phoneAnswered) {
      this.showPhoneOffers();
      return;
    }
    this.stage.phone.ringing = true;
    this.sfx.startRinging();
    this.stage.post.roll = 0.7;
    this.stage.studio.fluoFlicker = 2;
    this.hud.hint = 'THE PHONE IS RINGING — LOOK LEFT, [ENTER] TO ANSWER';
    this.setChoice(null, null);
    if (g.run.phone?.reason !== 'secret') this.hostSay('phone', 'shock', 'point');
    this.updateArrows();
  }

  private answerPhone(): void {
    const g = this.game;
    if (!g || g.run.phase !== 'PhoneCall' || this.phoneAnswered) return;
    this.phoneAnswered = true;
    this.sfx.stopRinging();
    this.sfx.play('pickup');
    this.stage.phone.ringing = false;
    this.stage.phone.offHook = 1;
    this.stage.post.roll = 0.15;
    this.stage.rig.go('left');
    this.music.setLevel(0.25);
    this.hud.hint = '';
    const ph = g.run.phone!;
    this.producerSay(ph.intro, ph.reason === 'secret');
    this.showPhoneOffers();
  }

  private showPhoneOffers(): void {
    const g = this.game!;
    const ph = g.run.phone!;
    const secret = ph.reason === 'secret';
    const nameOf = (id: string) => artifactDef(id).name;
    this.setChoice(
      {
        title: secret ? 'THE OTHER LINE' : ph.reason === 'deadAir' ? 'THE PRODUCER — DEAD AIR' : 'THE PRODUCER',
        lines: [ph.intro],
        options: [
          ...ph.offers.map((o) => {
            const b = bargainDef(o.bargainId);
            return { label: fillDeal(b.deal, o.params, nameOf), detail: `"${b.line}"`, color: secret ? '#d0a0ff' : '#ffb080' };
          }),
          { label: 'HANG UP', detail: secret ? 'Click.' : 'He will remember.' },
        ],
        selected: 0,
        layout: 'cards',
        accent: secret ? '#c080ff' : '#ff8040',
        footer: '1-3 OR CLICK',
      },
      (i) => {
        this.setChoice(null, null);
        this.stage.phone.offHook = 0;
        this.stage.post.roll = 0;
        this.music.setLevel(1, 1.5);
        if (i < ph.offers.length) {
          const b = bargainDef(ph.offers[i].bargainId);
          this.producerSay(secret ? '(the line goes quiet. somewhere below you, something unlocks.)' : 'Pleasure doing business. The Network thanks you.', secret);
          g.phoneAccept(i);
          this.hud.toast('DEAL.', '#ff9060');
          void b;
          this.layoutSig = '';
        } else {
          g.phoneHangUp();
          this.sfx.play('hangup');
          this.hud.toast('CLICK.', '#c0c0c0');
        }
        this.phoneAnswered = false;
        void this.enterPhase();
      },
    );
  }

  // ===================================================================================
  // Deadline end / game over / victory
  // ===================================================================================
  private async presentDeadlineEnd(e: DeadlineEndResult): Promise<void> {
    const st = this.stage;
    await this.withBusy(async () => {
      this.fsm.force('DeadlineEnd');
      this.setChoice(null, null);
      st.rig.go('down', 0.5);
      await wait(0.6);
      if (e.deposit && e.deposit.amount > 0) {
        this.sfx.play('cascade', { gain: 0.6 });
        st.tray.setAmount(0, false);
        st.vault.pressButton();
        await wait(0.4);
        this.sfx.play('thunk');
      }
      st.vault.setVault(e.vaultBefore);
      await wait(0.8 / this.speed);
      st.marquee.set(`PAYMENT DUE: $${e.debt}`, '#ffd040', true);
      this.hud.showBanner(e.paid ? 'PAID' : 'SHORT', e.paid ? `$${e.debt} TO THE NETWORK` : `VAULT $${e.vaultBefore} OF $${e.debt}`, e.paid ? '#80ff80' : '#ff3020', 2.2);
      if (e.paid) {
        st.vault.setVault(e.vaultAfter);
        st.vault.shake = 0.4;
        this.sfx.play('thunk', { pitch: 0.8 });
        this.sfx.play('applause', { gain: 0.4 });
        if (e.saved) this.hud.toast('THE TRAPDOOR LEVER SAVED YOU', '#ffd040');
        this.hostSay('debtPaid', 'grin', 'cheer');
        await wait(1.6 / this.speed);
      } else {
        this.hostSay('debtMissed', 'sad', 'slump');
        await wait(1.2);
      }
      this.sync(false);
    });
  }

  private async gameOver(): Promise<void> {
    const g = this.game!;
    const st = this.stage;
    await this.withBusy(async () => {
      this.fsm.force('GameOver');
      this.runSlot.clear();
      this.music.stop();
      st.rig.go('center', 0.4);
      await wait(0.4);
      // Lights die one by one.
      st.wheel.bulbsOn = 0;
      this.sfx.play('powerup', { pitch: 0.5, gain: 0.5 });
      await wait(0.4);
      st.studio.spotLevel = 0;
      await wait(0.4);
      st.studio.lightLevel = 0.15;
      st.host.expression = 'dead';
      await wait(0.6);
      this.sfx.play('trapdoor', { gain: 1 });
      if (this.settings.screenShake) st.rig.shake(1.2);
      const t0 = performance.now();
      while (performance.now() - t0 < 900) {
        const k = (performance.now() - t0) / 900;
        st.studio.openTrapdoor(k);
        st.rig.offset.y = -k * 3;
        st.post.fade = 1 - k;
        await wait(1 / 60);
      }
      st.post.fade = 0;
    });
    const r = g.run;
    if (!r.marks.metaApplied) {
      r.marks.metaApplied = 1;
      const res = applyRun(this.meta, r);
      this.saveMeta();
      this.menus.showSummary(false, r.deadline, res.ratings, res.newUnlocks, false);
    }
    this.resetStageAfterRun();
    this.game = null;
    this.hud.ticker = '';
  }

  private resetStageAfterRun(): void {
    const st = this.stage;
    setTimeout(() => {
      st.post.fade = 1;
      st.rig.offset.set(0, 0, 0);
      st.studio.openTrapdoor(0);
      st.studio.lightLevel = 1;
      st.studio.spotLevel = 1;
      st.wheel.bulbsOn = 1;
      st.host.expression = 'smile';
      st.host.setPose('idle');
      st.tray.setAmount(0, false);
      st.vault.setVault(0, true);
      st.shelf.setArtifacts([]);
      st.cabinet.setShop(null, 0, () => false);
      this.music.setDeadline(1);
    }, 600);
  }

  private async victory(): Promise<void> {
    const g = this.game!;
    const st = this.stage;
    await this.withBusy(async () => {
      this.fsm.force('Victory');
      st.rig.go('center', 0.5);
      this.sfx.play('jackpot');
      this.sfx.play('applause', { gain: 0.8 });
      if (!this.settings.reducedFlashing) st.vfx.confetti(st.post.width, 160);
      st.marquee.set('PAID IN FULL — PAID IN FULL —', '#80ff80', true);
      this.hostSay('victory', 'grin', 'cheer');
      await wait(2.5);
    });
    const r = g.run;
    const preview = computeRatings(r);
    this.menus.showSummary(true, r.deadline, preview, [], endlessUnlocked(this.meta));
    if (!endlessUnlocked(this.meta)) {
      // Retire immediately applies the meta (summary shows the RETIRE button only).
    }
  }

  // ===================================================================================
  // Shop interactions
  // ===================================================================================
  private shopBuy(i: number): void {
    const g = this.game;
    if (!g || g.run.phase !== 'Shop') return;
    const it = g.run.shop?.items[i];
    if (!it) return;
    const res = g.shopBuy(i);
    if (!res.ok) {
      this.sfx.play('error');
      this.hud.toast((res.reason ?? 'NO').toUpperCase(), '#ff6040');
      return;
    }
    this.sfx.play(it.type === 'wedge' ? 'button' : 'cascade', { gain: 0.5, pitch: 1.5 });
    if (it.type === 'artifact') this.hud.toast(`${artifactDef(it.id).name.toUpperCase()} ON THE SHELF`);
    if (it.type === 'scratch') this.hud.toast(`${scratchDef(it.id).name.toUpperCase()} CARD`);
    void this.enterPhase();
  }

  private shopReroll(): void {
    const g = this.game;
    if (!g || g.run.phase !== 'Shop') return;
    const r = g.shopReroll();
    if (!r.ok) {
      this.sfx.play('error');
      this.hud.toast((r.reason ?? 'NO').toUpperCase(), '#ff6040');
      return;
    }
    this.stage.cabinet.turnCrank();
    this.sfx.play('crank');
    this.sync(false);
  }

  private service(b: ServiceButton): void {
    const g = this.game;
    if (!g || g.run.phase !== 'Shop') return;
    if (b === 'reroll') return this.shopReroll();
    if (b === 'done') {
      this.stage.cabinet.setSelectedService(null);
      g.leaveShop();
      this.sfx.play('button');
      void this.enterPhase();
      return;
    }
    const cost = g.serviceCost(b === 'widen' || b === 'narrow' ? 'resize' : b);
    if (g.run.tokens < cost) {
      this.sfx.play('error');
      this.hud.toast('NOT ENOUGH TOKENS', '#ff6040');
      return;
    }
    this.stage.cabinet.setSelectedService(b);
    this.beginTarget(b);
  }

  /** Choose a wedge on the wheel (install / remove / gild / resize). */
  private beginTarget(mode: TargetMode): void {
    this.target = { mode, idx: this.target?.idx ?? 0 };
    this.setChoice(null, null);
    this.stage.rig.go('center');
    this.hud.hint = `${mode.toUpperCase()}: ←/→ OR CLICK A WEDGE · ENTER CONFIRM · BACKSPACE CANCEL`;
    this.highlightTarget();
    this.updateArrows();
  }

  private highlightTarget(): void {
    const g = this.game;
    if (!g || !this.target) return;
    const L = g.layout();
    const seg = L.segments.find((s) => s.wedgeIdx === this.target!.idx);
    this.stage.wheel.showHighlight(seg ? seg.idx : null, this.target.mode === 'remove' ? 0xff2020 : 0x40ff60, 0.45);
    const w = g.run.wheel[this.target.idx];
    if (w) this.hud.tooltip = null;
    if (seg) this.hud.hint = `${this.target.mode.toUpperCase()} → ${WEDGES[seg.kind].name.toUpperCase()}${seg.kind === 'cash' ? ` $${Math.round(g.cashValueOf(seg))}` : ''} · ENTER OK · BACKSPACE CANCEL`;
  }

  private confirmTarget(): void {
    const g = this.game;
    const t = this.target;
    if (!g || !t) return;
    let res: { ok: boolean; reason?: string };
    if (t.mode === 'replace') res = g.replaceWedge(t.idx);
    else if (t.mode === 'remove') res = g.shopRemove(t.idx);
    else if (t.mode === 'gild') res = g.shopGild(t.idx);
    else res = g.shopResize(t.idx, t.mode === 'widen' ? 1 : -1);
    if (!res.ok) {
      this.sfx.play('error');
      this.hud.toast((res.reason ?? 'NO').toUpperCase(), '#ff6040');
      return;
    }
    this.sfx.play('thunk', { pitch: 1.6, gain: 0.5 });
    this.endTarget();
  }

  private endTarget(): void {
    const g = this.game;
    if (g?.run.phase === 'WedgeReplace') g.replaceWedge(null);
    this.target = null;
    this.stage.wheel.showHighlight(null);
    this.stage.cabinet.setSelectedService(null);
    this.layoutSig = '';
    void this.enterPhase();
  }

  // ===================================================================================
  // Input routing
  // ===================================================================================
  private wireInput(): void {
    const inp = this.input;
    inp.toInternal = (x, y) => {
      const r = this.canvas.getBoundingClientRect();
      return this.stage.post.toInternal(x - r.left, y - r.top, r.width, r.height);
    };
    inp.isBusy = () => this.busy > 0 || this.stage.wheel.busy;
    inp.onAction = (a) => this.onAction(a);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.menus.open && this.menus.page === 'pause') {
        e.preventDefault();
        this.resume();
      }
    });
  }

  private onAction(a: Action): void {
    if (this.menus.open) return;
    if (this.fsm.state === 'Boot') return;
    const g = this.game;
    if (a.type === 'pause') {
      if (this.target) return this.endTarget();
      if (g) {
        this.charge = null;
        this.menus.show('pause', null);
      }
      return;
    }
    if (a.type === 'fast') {
      this.applySettings({ ...this.settings, fastMode: !this.settings.fastMode });
      this.hud.toast(this.settings.fastMode ? 'FAST MODE ON' : 'FAST MODE OFF', '#80ff80');
      if (this.settings.fastMode) this.stage.wheel.skip();
      return;
    }
    if (!g) return;
    if (a.type === 'leverDown') return this.startCharge();
    if (a.type === 'leverUp') {
      if (this.charge) void this.releaseCharge();
      return;
    }
    if (this.charge) {
      if (a.type === 'key' && a.key === 'e' && g.canPeek()) {
        this.charge.peek = true;
        this.sfx.play('blip', { pitch: 2.4 });
      }
      return;
    }
    // Choice panels take priority.
    if (this.hud.choice && this.choiceHandler) {
      const n = this.hud.choice.options.length;
      if (a.type === 'num' && a.n >= 1 && a.n <= n) return this.pickChoice(a.n - 1);
      if (a.type === 'nav' && (a.dir === 'left' || a.dir === 'up')) {
        this.choiceSel = (this.choiceSel - 1 + n) % n;
        this.hud.choice.selected = this.choiceSel;
        this.sfx.play('blip', { gain: 0.3 });
        return;
      }
      if (a.type === 'nav' && (a.dir === 'right' || a.dir === 'down')) {
        this.choiceSel = (this.choiceSel + 1) % n;
        this.hud.choice.selected = this.choiceSel;
        this.sfx.play('blip', { gain: 0.3 });
        return;
      }
      if (a.type === 'confirm') return this.pickChoice(this.choiceSel);
      if (a.type === 'back' && this.choiceBack) return this.choiceBack();
      if (a.type === 'click') {
        const i = this.hud.hitChoice(a.x, a.y);
        if (i >= 0) this.pickChoice(i);
      }
      return;
    }
    // Wedge targeting.
    if (this.target) {
      const n = g.run.wheel.length;
      if (a.type === 'nav' && (a.dir === 'left' || a.dir === 'right')) {
        this.target.idx = (this.target.idx + (a.dir === 'right' ? 1 : -1) + n) % n;
        this.sfx.play('ratchet', { gain: 0.4 });
        this.highlightTarget();
        return;
      }
      if (a.type === 'confirm') return this.confirmTarget();
      if (a.type === 'back') return this.endTarget();
      if (a.type === 'click') {
        const hit = this.stage.pick(a.x, a.y);
        if (hit?.id === 'wheel' && hit.uv) {
          const L = g.layout();
          const s = L.segments[segmentAt(L, uvToLocalAngle(hit.uv.x, hit.uv.y))];
          if (this.target.idx === s.wedgeIdx) this.confirmTarget();
          else {
            this.target.idx = s.wedgeIdx;
            this.highlightTarget();
          }
        }
      }
      return;
    }
    if (a.type === 'nav') {
      this.stage.rig.nav(a.dir);
      this.hud.hint = this.stage.rig.station === 'center' && g.run.phase === 'AwaitAction' ? 'HOLD SPACE (OR THE LEVER) TO SPIN' : g.run.phase === 'Shop' ? this.hud.hint : '';
      if (g.run.phase === 'PhoneCall' && !this.phoneAnswered) this.hud.hint = 'THE PHONE IS RINGING — [ENTER] TO ANSWER';
      this.updateArrows();
      return;
    }
    if (a.type === 'click') {
      const arrow = this.hud.hitArrow(a.x, a.y);
      if (arrow) return this.onAction({ type: 'nav', dir: arrow });
      const hit = this.stage.pick(a.x, a.y);
      if (hit) this.onPick(hit.id, hit.uv, a.button);
      return;
    }
    const station = this.stage.rig.station;
    if (a.type === 'confirm') {
      if (g.run.phase === 'PhoneCall') return this.answerPhone();
      if (g.run.phase === 'AwaitAction') return this.doDeposit();
      if (g.run.phase === 'Shop') return this.shopBuy(this.shopSel);
      return;
    }
    if (a.type === 'num') {
      if (g.run.phase === 'Shop' && station === 'right' && a.n >= 1 && a.n <= 6) {
        this.shopSel = a.n - 1;
        return this.shopBuy(a.n - 1);
      }
      if (station === 'left' && a.n >= 1 && a.n <= 6) return this.selectArtifact(a.n - 1);
      if (a.n >= 1 && a.n <= 3) return this.useCard(a.n - 1);
      return;
    }
    if (a.type === 'back') {
      if (this.stage.shelf.selected >= 0) return this.sellSelected();
      return;
    }
    if (a.type === 'key') {
      const k = a.key;
      if (g.run.phase === 'Shop') {
        if (k === 'r') return this.shopReroll();
        if (k === 'x') return this.service('remove');
        if (k === 'g') return this.service('gild');
        if (k === '+' || k === '=') return this.service('widen');
        if (k === '-') return this.service('narrow');
        if (k === 'n') return this.service('done');
      }
      if (k === ',' || k === '<') return this.moveSelected(-1);
      if (k === '.' || k === '>') return this.moveSelected(1);
      if (k === 'x' && this.stage.shelf.selected >= 0) return this.sellSelected();
      if (k === 'h' && g.run.phase === 'PhoneCall' && this.phoneAnswered) return this.pickChoice(this.hud.choice ? this.hud.choice.options.length - 1 : 0);
    }
  }

  private pickChoice(i: number): void {
    const h = this.choiceHandler;
    if (!h || !this.hud.choice) return;
    const o = this.hud.choice.options[i];
    if (!o || o.disabled) {
      this.sfx.play('error');
      return;
    }
    this.sfx.play('button', { gain: 0.5 });
    h(i);
  }

  private onPick(id: string, uv: THREE.Vector2 | null, button: number): void {
    const g = this.game!;
    if (id === 'lever') return this.startCharge();
    if (id === 'deposit') return this.doDeposit();
    if (id === 'phone') return this.answerPhone();
    if (id.startsWith('scratch:')) return this.useCard(Number(id.split(':')[1]));
    if (id.startsWith('artifact:')) {
      const i = Number(id.split(':')[1]);
      if (button === 2) {
        this.stage.shelf.selected = i;
        return this.sellSelected();
      }
      return this.selectArtifact(i);
    }
    if (id.startsWith('shop:')) {
      const i = Number(id.split(':')[1]);
      this.shopSel = i;
      return this.shopBuy(i);
    }
    if (id === 'crank') return this.shopReroll();
    if (id === 'services' && uv) return this.service(CabinetView.serviceAt(uv));
    if (id === 'host') return this.hostSay('idle', 'wink', 'present');
    if (id === 'wheel' || id === 'ring') {
      if (this.stage.rig.station !== 'center') this.stage.rig.go('center');
      return;
    }
    if (id === 'tray' || id === 'vault') {
      if (this.stage.rig.station !== 'down') this.stage.rig.go('down');
    }
    void g;
  }

  private doDeposit(): void {
    const g = this.game;
    if (!g || g.run.phase !== 'AwaitAction') return;
    const before = g.run.tray;
    const res = g.deposit();
    this.stage.vault.pressButton();
    this.sfx.play('button');
    if (before > 0) {
      this.sfx.play('cascade', { gain: 0.5, pitch: 0.8 });
      setTimeout(() => this.sfx.play('thunk'), 300);
      if (res.lost) this.hud.toast(`LOST $${res.lost} ON THE WAY`, '#ff8060');
      if (res.keptStreak) this.hud.toast('STREAK KEPT', '#80ffff');
      if (Math.random() < 0.6) this.hostSay('deposit', 'talk', 'present');
    }
    this.sync(false);
  }

  private useCard(i: number): void {
    const g = this.game;
    if (!g) return;
    if (!g.canUseScratch(i)) {
      this.sfx.play('error');
      if (g.run.scratch[i]) this.hud.toast(`${scratchDef(g.run.scratch[i]).name.toUpperCase()}: NOT NOW`, '#ff8060');
      return;
    }
    const id = g.run.scratch[i];
    g.useScratch(i);
    this.sfx.play('scratch');
    this.hud.toast(`${scratchDef(id).name.toUpperCase()}!`, '#ffe080');
    this.layoutSig = '';
    this.sync(false);
  }

  private selectArtifact(i: number): void {
    const g = this.game!;
    if (i >= g.run.artifacts.length) {
      this.stage.shelf.selected = -1;
      return;
    }
    const sel = this.stage.shelf.selected;
    if (sel >= 0 && sel !== i) {
      g.moveArtifact(sel, i);
      this.stage.shelf.selected = -1;
      this.sfx.play('clink');
      this.hud.toast('SHELF REARRANGED');
      this.sync(false);
      return;
    }
    this.stage.shelf.selected = sel === i ? -1 : i;
    this.sellArmed = -1;
    this.sfx.play('blip');
    if (this.stage.shelf.selected >= 0) this.hud.toast(`${artifactDef(g.run.artifacts[i].id).name.toUpperCase()} — CLICK ANOTHER SLOT TO SWAP, < > MOVE, X SELL`);
  }

  private moveSelected(d: number): void {
    const g = this.game!;
    const s = this.stage.shelf.selected;
    if (s < 0) return;
    const t = s + d;
    if (t < 0 || t >= g.run.artifacts.length) return;
    g.moveArtifact(s, t);
    this.stage.shelf.selected = t;
    this.sfx.play('clink');
    this.sync(false);
  }

  private sellSelected(): void {
    const g = this.game!;
    const s = this.stage.shelf.selected;
    if (s < 0 || !g.run.artifacts[s]) return;
    if (!['Shop', 'AwaitAction', 'PackageSelect', 'Conversion'].includes(g.run.phase)) return;
    if (this.sellArmed !== s) {
      this.sellArmed = s;
      const v = sellValue(artifactDef(g.run.artifacts[s].id).cost, g.sellMult());
      this.hud.toast(`SELL FOR ${v} TOK? PRESS AGAIN`, '#ffb060');
      return;
    }
    const v = g.sellArtifact(s);
    this.sellArmed = -1;
    this.stage.shelf.selected = -1;
    this.sfx.play('cascade', { gain: 0.4, pitch: 1.6 });
    this.hud.toast(`SOLD +${v} TOK`);
    this.sync(false);
  }

  // ===================================================================================
  // Frame
  // ===================================================================================
  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    let dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      dt = 0;
    }
    const st = this.stage;
    const g = this.game;
    // Lever charging: the meter oscillates; ratchet ticks; Glass Eye live preview.
    if (this.charge && g) {
      this.charge.t += dt;
      const p = meterValue(this.charge.t);
      st.lever.pull = p * 0.6;
      const ch = g.chargeContext();
      st.lever.drawGauge(p, BALANCE.sweetCenter, ch.sweetHalfWidth, true, this.charge.peek);
      if (Math.floor(this.charge.t * 14) !== this.charge.lastTick) {
        this.charge.lastTick = Math.floor(this.charge.t * 14);
        this.sfx.play('ratchet', { gain: 0.25, pitch: 0.8 + p });
      }
      if (this.charge.peek && Math.floor(this.time * 30) % 3 === 0) {
        const pv = g.previewLanding(p);
        st.wheel.showHighlight(pv.segIdx, 0x60a0ff, 0.5);
      }
    }
    if (g && g.run.phase === 'AwaitAction' && !this.busy && !this.charge) {
      this.idleTimer += dt;
      if (this.idleTimer > 25) {
        this.idleTimer = 0;
        this.hostSay('idle', 'wink', 'present');
      }
    } else this.idleTimer = 0;
    this.music.setBuzz(st.studio.lightLevel);
    st.post.roll = Math.max(g?.run.phase === 'PhoneCall' && !this.phoneAnswered ? 0.7 : 0, st.post.roll - dt * 0.4);
    if (this.settings.reducedFlashing) st.post.roll = Math.min(st.post.roll, 0.25);
    st.update(dt, this.time, this.speed);
    this.input.flush();
    this.hud.update(dt);

    // Hover tooltip.
    const m = this.input.mouse;
    if (!this.target) {
      const hit = m.inside && !this.hud.choice ? st.pick(m.x, m.y) : null;
      this.hud.tooltip = hit ? tooltipFor(hit, g) : null;
    }
    // Overlay.
    const ctx = st.post.ui;
    const w = st.post.width,
      h = st.post.height,
      k = st.post.scale;
    ctx.clearRect(0, 0, w, h);
    st.vfx.draw(ctx, st.rig.camera, w, h, k);
    this.hud.showCursor = !this.menus.open;
    this.hud.draw(ctx, w, h, k, m, this.time);
    if (this.debug) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 120 * k, 10 * k);
      ctx.fillStyle = '#0f0';
      ctx.font = `${8 * k}px monospace`;
      ctx.fillText(`calls ${st.stats.calls} tris ${st.stats.triangles} ${this.fsm.state}`, 2, 8 * k);
    }
    st.render(this.time);
  }
}
