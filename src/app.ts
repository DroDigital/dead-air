/**
 * App controller: owns the FSM, the Game, the Stage, audio and UI. The rules core runs
 * instantly; this layer replays results as animations, captions and sound.
 */
import { art } from './assets/art';
import { Assets } from './assets/loader';
import { Mixer } from './audio/mixer';
import { Music } from './audio/music';
import { Sfx } from './audio/sfx';
import { HOST_VOICE, PRODUCER_VOICE, SECRET_VOICE, Voice } from './audio/voice';
import { VoPlayer, type VoMood } from './audio/vo';
import { artifactDef } from './content/artifacts';
import { bargainDef, fillDeal } from './content/bargains';
import { COMBO_NAMES } from './game/combos';
import { DEADLINE_LINES, HOST_LINES, HOST_SILENT_LINES, PRODUCER_ACCEPT, PRODUCER_HANGUP, SECRET_ACCEPT, SLIP_WHISPER, type HostTrigger } from './content/hostLines';
import { challengeText } from './content/challenges';
import { mutatorDef } from './content/mutators';
import { scratchDef } from './content/scratchCards';
import { WEDGES } from './content/wedges';
import { defaultSettings, sanitizeSettings, SETTINGS_VERSION, type Settings } from './core/config';
import { APP_TRANSITIONS, Fsm, type AppState } from './core/fsm';
import { META_MIGRATIONS, RUN_MIGRATIONS, SAVE_KEYS, SETTINGS_MIGRATIONS, SaveSlot, defaultStorage } from './core/save';
import { BALANCE } from './game/balance';
import { META_VERSION, applyRun, computeRatings, endlessUnlocked, newMeta, noteRunProgress, unlockedArtifacts, unlockedWedges, type MetaState } from './game/meta';
import { Game, RUN_VERSION, type DeadlineEndResult, type SpinOutcome, type SpinResolution } from './game/run';
import { sellValue } from './game/shop';
import type { HorrorEvent, PackageId, RunState } from './game/types';
import { rot as rotOf } from './game/rot';
import { angleForSegment, mod360 } from './game/wheel';
import { CabinetView, type ServiceButton } from './render/scene/cabinet';
import { buildProp } from './render/scene/props';
import { Stage } from './render/stage';
import { BootScreens } from './ui/bootScreens';
import { randomSeedString } from './core/rng';
import { advanceCharge, GRAB_MIN, grabPower, type ChargeMeter } from './ui/charge';
import { Hud, type ChoicePanel } from './ui/hud';
import { Input, type Action } from './ui/input';
import { Menus } from './ui/menus';
import { segmentLabel, tooltipFor, uvToLocalAngle } from './ui/tooltips';
import { segmentAt } from './game/wheel';
import * as THREE from 'three';

type TargetMode = 'replace' | 'remove' | 'gild' | 'widen' | 'narrow';

const wait = (s: number) => new Promise<void>((r) => setTimeout(r, s * 1000));

const DEG = Math.PI / 180;

/**
 * How much a host line matters. 3: always heard, may cut in (the show's beats). 2: worth saying
 * unless something bigger is playing. 1: small talk, dropped freely when the player is quick.
 */
const HOST_PRIORITY: Partial<Record<HostTrigger, number>> = {
  intro: 3,
  title: 3,
  package: 3,
  sweep: 3,
  endless: 3,
  jackpot: 3,
  debtMissed: 3,
  gameOver: 3,
  victory: 3,
  phone: 3,
  collateral: 3,
  silence: 3,
  bankrupt: 2,
  bigWin: 2,
  hatTrick: 2,
  lastSpin: 2,
  debtPaid: 2,
  dealTaken: 2,
  dealRefused: 2,
  gambleOffer: 2,
  gambleWin: 2,
  gambleLose: 2,
  mouth: 2,
  cleaver: 2,
  eye: 2,
  stitchTear: 2,
};

export class App {
  readonly assets = new Assets();
  stage!: Stage;
  readonly mixer = new Mixer();
  readonly sfx = new Sfx(this.mixer);
  readonly music = new Music(this.mixer);
  readonly voice = new Voice(this.mixer);
  readonly vo = new VoPlayer(this.mixer);
  private loops: { drum?: { stop: (f?: number) => void } | null; heart?: { stop: (f?: number) => void } | null } = {};
  private lastSpinSaid = -1;
  /** Spins the current Deadline started with (for the chyron pips). */
  private spinsMax = 8;
  private spinsMaxFor = -1;
  private phoneTalk: number[] = [];
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
  private settingsSlot = new SaveSlot<Settings>(SAVE_KEYS.settings, SETTINGS_VERSION, SETTINGS_MIGRATIONS, this.storage);
  private busy = 0;
  private bootScreens: BootScreens | null = null;
  /** True until the intro has played or been skipped: the menu's sound waits for it. */
  private introPending = false;
  private time = 0;
  private hitstop = 0;
  private charge: (ChargeMeter & { lastTick: number }) | null = null;
  /** Slow motion: the stage's clock runs at `timeScale`, eased toward `timeScaleTarget`. */
  private timeScale = 1;
  private timeScaleTarget = 1;
  /** A dramatic spin's finish (decided when the spin starts): when its slow-motion close-up begins. */
  private drama: { at: number; started: boolean; kind: 'jackpot' | 'bankrupt' | 'big' | 'near'; beds: { stop: (fade?: number) => void }[] } | null = null;
  /** The wheel in the player's hand: the mouse's angle round the hub, the wheel's angle, recent samples. */
  private grab: { ang: number; theta: number; samples: { t: number; th: number }[]; seg: number } | null = null;
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
  private deferToken = 0;
  private debug = false;
  /** Horror beats from the rules, held until the spin's result is presented. */
  private pendingHorror: HorrorEvent[] = [];
  /** Policy 7: seconds since the player last did anything at the wheel, and a cooldown. */
  private lastInput = 0;
  private silenceCool = 0;
  private bulbsDead = 0;
  /** Who is talking until when (app clock), how important it was, and when the last line ended. */
  private speech = { until: 0, prio: 0, lastEnd: -99 };

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
      onNewRun: (c) => void this.goLive(c),
      onResume: () => this.resume(),
      onAbandon: () => {
        this.menus.show('pause');
        this.abandon();
      },
      onNextContestant: () => void this.goLive(),
      hasGame: () => !!this.game && this.game.run.phase !== 'GameOver' && !this.game.run.marks.metaApplied,
      onSettings: (s) => this.applySettings(s),
      onEndlessContinue: () => this.endlessContinue(),
      onRetire: () => this.retire(),
      onUiSound: (k) => (k === 'slam' ? (this.sfx.play('impact', { gain: 0.9 }), this.sfx.play('thunk', { gain: 0.5, pitch: 0.7 })) : this.sfx.play(k === 'select' ? 'button' : 'blip', { gain: 0.5 })),
      onLoreNote: (text) => {
        if (!text) return this.vo.stop();
        this.sfx.play('static', { gain: 0.25, pitch: 0.7 });
        this.vo.play('archive', text, { wear: 0.4, glitch: 0.05 });
      },
      loreVoiced: (text) => this.vo.has('archive', text),
      getMeta: () => this.meta,
      getSettings: () => this.settings,
      hasSave: () => this.runSlot.exists() && !!this.runSlot.load(),
      artifactIcon: (id, drawnOnly) => (drawnOnly ? art.url(`artifact.${id}`) : this.artifactIcon(id)),
    });
    let audioStarted = false;
    const firstGesture = () => {
      if (audioStarted) return;
      void this.mixer.resume().then(() => {
        if (audioStarted || !this.mixer.running) return;
        audioStarted = true;
        window.removeEventListener('pointerdown', firstGesture);
        window.removeEventListener('keydown', firstGesture);
        // While the intro plays, its soundtrack is the only sound; the menu's music waits for it.
        if (!this.introPending) this.startMenuAudio(true);
      }).catch(() => { /* A later user gesture can retry audio. */ });
    };
    window.addEventListener('pointerdown', firstGesture);
    window.addEventListener('keydown', firstGesture);
    this.input.onGamepadAction = (a) => {
      firstGesture();
      if (this.introPending) {
        this.bootScreens?.press();
        return;
      }
      if (this.menus.open) {
        if (a.type === 'pause' && this.menus.page === 'pause') this.resume();
        else this.menus.action(a);
      } else this.input.push(a);
    };

    void art.preload(undefined, (id) => id === 'screen.standby');
    // The boot: the VHS loading banner runs to the real progress, then (unless skipped) the intro.
    const skipIntro = new URLSearchParams(location.search).has('skipintro');
    this.introPending = !skipIntro;
    const screens = new BootScreens(() => this.settings.masterVolume);
    this.bootScreens = screens;
    await Promise.all([
      this.assets.preload((p) => {
        screens.progress(p);
        this.sfx.play('powerup', { gain: 0.15, pitch: 0.8 + p * 0.6 });
      }),
      art.preload(),
    ]);
    await this.sfx.loadFiles();
    void this.music.loadTracks();
    this.vo.preload(Object.values(HOST_LINES).flat().map((text) => ({ speaker: 'host' as const, text })));
    screens.progress(1);
    this.buildStage();
    this.wireInput();
    window.addEventListener('resize', () => this.stage.resize());
    this.applySettings(this.settings);
    requestAnimationFrame((t) => this.frame(t));
    await screens.whenReady(skipIntro);
    if (skipIntro) screens.close();
    else await screens.playIntro();
    this.introPending = false;
    this.bootScreens = null;
    if (new URLSearchParams(location.search).has('debug')) this.debug = true;
    this.fsm.go('Menu');
    // No title screen: from the curtain the camera comes into the studio and the show starts
    // (the saved broadcast resumes if there is one). The pause menu is the hub.
    await this.enterStudio();
  }

  /**
   * The camera glides in from the back of the studio as the lights come up, then the broadcast
   * starts: the saved one if there is one (unless `choice` asks for a new one), else a fresh run.
   */
  private async enterStudio(choice?: { seed: string; stake: number; startWheel: string }): Promise<void> {
    const st = this.stage;
    this.menus.hide();
    st.rig.go('center', 0.01);
    st.post.fade = 1;
    const glide = st.rig.flyIn(new THREE.Vector3(0.0, 1.9, 2.3), 3.6);
    this.music.kick();
    this.music.startAmbience();
    this.sfx.play('whoosh', { gain: 0.35, pitch: 0.6 });
    await this.powerOn();
    await wait(0.3);
    const save = !choice && this.runSlot.exists() ? this.runSlot.load() : null;
    if (save) await this.continueRun();
    else await this.newRun(choice?.seed ?? randomSeedString(), choice?.stake ?? 0, choice?.startWheel ?? 'standard');
    await glide;
  }

  /** A new broadcast from the hub (or the next contestant): any live run ends as a loss first. */
  private async goLive(choice?: { seed: string; stake: number; startWheel: string }): Promise<void> {
    // A spin or presentation in flight finishes first (as quitting always did).
    if (this.deferIfBusy(() => void this.goLive(choice))) return;
    const g = this.game;
    if (g && g.run.phase !== 'GameOver' && !g.run.marks.metaApplied) {
      g.run.endedAt = g.run.deadline;
      g.run.marks.metaApplied = 1;
      applyRun(this.meta, g.run);
      this.saveMeta();
    }
    this.runSlot.clear();
    this.game = null;
    this.hud.choice = null;
    this.hud.chyron = null;
    this.hud.ticker = '';
    this.vo.stop();
    this.stopHeartbeat();
    this.sfx.stopRinging();
    this.resetStageVisuals();
    await this.enterStudio(choice ?? { seed: randomSeedString(), stake: 0, startWheel: 'standard' });
  }

  /** The menu's music and ambience. On a first touch the host greets the player, unless the intro already did. */
  private startMenuAudio(greet: boolean): void {
    if (!this.game) {
      this.music.setTrack('menu');
      this.music.start();
    }
    this.music.kick();
    this.music.startAmbience();
    this.mixer.setVolumes(this.settings);
    if (greet && !this.game) {
      const t = HOST_LINES.title[Math.floor(Math.random() * HOST_LINES.title.length)];
      setTimeout(() => !this.game && this.vo.play('host', t, { wear: 0.25, glitch: 0.1 }), 600);
    }
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
    this.hud.reducedFlashing = this.settings.reducedFlashing;
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
    const drawn = art.url(`artifact.${id}`);
    if (drawn) return drawn;
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
    g.bus.on('challenge', () => {
      const ch = g.challenge();
      if (!ch) return;
      setTimeout(() => {
        this.hud.showBanner("SPONSOR'S CHALLENGE", `${ch.def.name} — +${ch.def.reward} TOKEN${ch.def.reward > 1 ? 'S' : ''}`, '#80ff80', 2.2 / this.speed);
        this.sfx.play('register', { gain: 0.6 });
        this.sfx.play('applause', { gain: 0.35, delay: 0.2 });
        this.stage.lights.applause = 2;
      }, 900);
    });
    g.bus.on('trigger', (t) => {
      this.stage.shelf.trigger(t.slot);
      this.sfx.play('blip', { pitch: 1.4 + t.slot * 0.1, gain: 0.4 });
      this.stage.vfx.float(this.stage.shelf.slotWorld(t.slot), t.text, '#ffd040');
    });
    g.bus.on('phone', () => {
      this.phoneAnswered = false;
    });
    g.bus.on('horror', (e) => {
      if (e.type !== 'collateral' && e.type !== 'silence') this.pendingHorror.push(e);
    });
    g.bus.on('artifactGained', (e) => {
      if (this.game && this.game.run.artifacts.length >= this.game.maxArtifacts()) this.game.run.marks.fullShelf = 1;
      this.sfx.play('pickup', { gain: 0.5 });
      void e;
    });
    this.music.setDeadline(g.run.deadline);
    this.music.setTrack('main');
    this.music.start();
    this.music.setLevel(1);
    this.stage.studio.openTrapdoor(0);
    this.stage.host.silent = !!g.run.marks.hostSilent;
    this.resetStageVisuals();
    // The dead in the stands, the hand on the chair, and whatever the run has already taken.
    this.pendingHorror = [];
    // The stands are never empty: three who came before you, plus everyone you have been.
    this.stage.audience.setCount(3 + this.meta.runs - this.meta.wins, this.settings.uncut);
    this.stage.audience.approach(Math.min(4, g.run.marks.silences ?? 0), g.run.marks.eyeLost ? 1 : -1);
    this.stage.collateral.reset();
    this.stage.collateral.setFingers(g.run.marks.fingers ?? 0);
    this.stage.post.eyePatch = g.run.marks.eyeLost ? 1 : 0;
    this.hud.fingersLost = g.run.marks.fingers ?? 0;
    this.bulbsDead = this.stage.wheel.deadBulbs = Math.floor(Math.max(0, rotOf(g.run) - 0.3) * 30);
    this.lastInput = this.time;
    this.stage.tray.setAmount(g.run.tray, false);
    this.stage.vault.setVault(g.run.vault, true);
    this.sync(false);
  }

  /** Normal lighting, closed trapdoor, host at rest and an empty cabinet: the state every run starts from. */
  /** Colour grade, danger tint and lighting mood follow the state of the show. */
  private updateMood(dt: number): void {
    const st = this.stage;
    const r = this.game?.run;
    const short = !!r && r.phase === 'AwaitAction' && r.spinsLeft <= 1 && r.vault + r.tray < r.debt;
    const phone = r?.phase === 'PhoneCall';
    const wear = r ? Math.min(1, (r.deadline - 1) / 8) : 0;
    if (short) {
      st.post.grade.setRGB(1.12, 0.86, 0.8);
      st.post.sat = 0.75;
    } else if (phone) {
      st.post.grade.setRGB(0.88, 0.97, 1.1);
      st.post.sat = 0.7;
    } else {
      // The picture yellows and fades as the run wears on.
      st.post.grade.setRGB(1.02 + wear * 0.06, 0.98, 0.92 - wear * 0.1);
      st.post.sat = 1 - wear * 0.25;
    }
    this.hud.danger += ((short ? 1 : 0) - this.hud.danger) * Math.min(1, dt * 3);
    // Heartbeat in the vignette while the last spin is short.
    const beat = short ? Math.pow(Math.max(0, Math.sin(this.time * 7.2)), 8) : 0;
    st.post.vig = 0.05 * this.hud.danger + beat * 0.25;
    st.post.flashAmt = Math.max(0, st.post.flashAmt - dt * 1.6);
    if (short && st.lights.mode === 'idle') st.lights.setMode('tense');
    else if (!short && !phone && st.lights.mode === 'tense') st.lights.setMode('idle');
    st.lights.reducedFlashing = this.settings.reducedFlashing;
    if (this.settings.reducedFlashing) st.post.shock = Math.min(st.post.shock, 0.3);
  }

  private stopHeartbeat(): void {
    this.loops.heart?.stop(0.8);
    this.loops.heart = null;
  }

  private resetStageVisuals(): void {
    this.stopHeartbeat();
    this.stage.lights.setMode('idle');
    this.stage.lights.onAir = true;
    this.stage.rig.dollyTarget = 0;
    this.loops.drum?.stop(0.05);
    this.loops.drum = null;
    this.vo.stop();
    const st = this.stage;
    st.post.fade = 1;
    st.rig.offset.set(0, 0, 0);
    st.studio.openTrapdoor(0);
    st.studio.lightLevel = 1;
    st.studio.spotLevel = 1;
    st.wheel.bulbsOn = 1;
    st.host.expression = 'smile';
    st.host.setPose('idle');
    st.cabinet.setShop(null, 0, () => false);
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
    this.deferToken++; // cancels a quit or abandon that was waiting for the broadcast to finish
    this.menus.hide();
    this.input.clear();
  }

  /** Quitting or abandoning waits until the current spin or presentation has finished. Returns true if deferred. */
  private deferIfBusy(action: () => void): boolean {
    if (!this.busy && !this.stage.wheel.busy && !this.charge) return false;
    const token = ++this.deferToken;
    const tick = () => {
      if (token !== this.deferToken) return;
      if (this.busy || this.stage.wheel.busy || this.charge) setTimeout(tick, 150);
      else action();
    };
    setTimeout(tick, 150);
    return true;
  }

  private abandon(): void {
    if (!this.game) return;
    if (this.deferIfBusy(() => this.abandon())) return;
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
    this.music.start();
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
    void this.goLive();
  }

  // ===================================================================================
  // Presentation helpers
  // ===================================================================================
  private hostSay(trigger: HostTrigger, face: Parameters<Stage['host']['say']>[0] = 'talk', pose?: Parameters<Stage['host']['setPose']>[0], text?: string): void {
    // The host never talks over himself for something less important, and the small talk waits
    // for a breath between lines (longer in fast play), so quick play doesn't stack and restart lines.
    const prio = HOST_PRIORITY[trigger] ?? 1;
    const now = this.time;
    const talking = now < this.speech.until;
    if (talking && (prio < 3 || prio <= this.speech.prio)) {
      if (pose) this.stage.host.setPose(pose);
      return;
    }
    const gap = prio >= 3 ? 0 : prio === 2 ? 1.2 : this.speed > 1 ? 9 : 4.5;
    if (!talking && now - this.speech.lastEnd < gap) {
      if (pose) this.stage.host.setPose(pose);
      return;
    }
    if (prio === 1 && this.speed > 1 && Math.random() < 0.6) return;
    const silent = !!this.game?.run.marks.hostSilent;
    const pool = silent ? HOST_SILENT_LINES : HOST_LINES[trigger];
    const line = silent ? pool[Math.floor(Math.random() * pool.length)] : (text ?? pool[Math.floor(Math.random() * pool.length)]);
    const voiced = silent ? 0 : this.vo.play('host', line, this.hostMood(trigger));
    if (voiced) this.voice.stop();
    const dur = silent ? 1.5 : voiced || this.voice.speak(line, HOST_VOICE, this.speed > 1 ? 1.4 : 1);
    this.speech = { until: now + dur, prio, lastEnd: now + dur };
    this.stage.host.say(face, dur);
    if (pose) this.stage.host.setPose(pose);
    if (this.settings.captions) this.hud.caption('HOST', line, '#7dffa8', voiced ? dur : dur / (this.speed > 1 ? 1.5 : 1));
  }

  /** The host's voice wears out with the show: more tape wear each Deadline, glitches when it goes wrong. */
  private hostMood(trigger: HostTrigger): VoMood {
    const r = this.game?.run;
    const d = r?.deadline ?? 1;
    const wear = Math.min(1, (d - 1) / 8);
    const bad = trigger === 'debtMissed' || trigger === 'gameOver';
    const glitch = bad ? 0.75 : trigger === 'bankrupt' ? 0.3 : d >= 7 ? 0.22 : d >= 5 ? 0.1 : r?.mutator ? 0.12 : 0;
    return { wear, glitch, powerDown: trigger === 'gameOver' };
  }

  private producerSay(text: string, secret: boolean): number {
    const deadAir = this.game?.run.phone?.reason === 'deadAir';
    const voiced = this.vo.play(secret ? 'secret' : 'producer', text, { wear: 0, glitch: deadAir ? 0.3 : 0 });
    if (voiced) this.voice.stop();
    const dur = voiced || this.voice.speak(text, secret ? SECRET_VOICE : PRODUCER_VOICE, 1.2);
    if (this.settings.captions) this.hud.caption(secret ? '???' : 'THE PRODUCER', text, secret ? '#c080ff' : '#ff9060', dur);
    // The caller has the floor: the host's chatter waits.
    this.speech = { until: this.time + dur, prio: 3, lastEnd: this.time + dur };
    return dur;
  }

  private ticker(): void {
    const g = this.game;
    if (!g) return;
    const r = g.run;
    const d = r.deadline > BALANCE.deadlinesPerRun ? `∞${r.deadline}` : `${r.deadline}/8`;
    this.hud.ticker = `D${d}  SPINS ${r.spinsLeft}  TRAY $${r.tray} ×${r.streak.toFixed(2)}  VAULT $${r.vault}/${r.debt}`;
    this.hud.chyron = { deadline: d, spins: r.spinsLeft, spinsMax: Math.max(this.spinsMax, r.spinsLeft), tray: r.tray, streak: r.streak, vault: r.vault, debt: r.debt };
    this.hud.tickerRight = '';
    this.hud.corner = `TOK ${r.tokens}`;
    const ch = g.challenge();
    this.hud.challenge = ch
      ? {
          name: ch.def.name,
          text: challengeText(ch.def, r).toUpperCase(),
          prog: ch.def.mode === 'count' ? `${Math.min(ch.progress, ch.target)}/${ch.target}` : ch.def.id === 'streak' ? `(×${ch.progress.toFixed(2)})` : `($${Math.round(ch.progress)})`,
          done: ch.done,
        }
      : null;
  }

  /** Push the current run state to every view. */
  private sync(pour: boolean): void {
    const g = this.game;
    if (!g) return;
    const r = g.run;
    const st = this.stage;
    const L = g.layout();
    const ring = g.effectiveRing();
    const sig = JSON.stringify([L.segments.map((s) => [s.kind, s.start.toFixed(2), Math.round(g.cashValueOf(s)), s.gild, s.overridden]), ring, this.settings.colorblind, st.wheel.bloody]);
    if (sig !== this.layoutSig) {
      this.layoutSig = sig;
      st.wheel.setLayout(L, ring, (s) => segmentLabel(g, s));
    }
    st.wedgeProps.sync(L, r.marks, this.settings.uncut);
    this.hud.fingersLost = r.marks.fingers ?? 0;
    st.post.eyePatch = Math.max(st.post.eyePatch, r.marks.eyeLost ? 1 : 0);
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
    if (!this.charge && !this.grab) st.lever.drawGauge(0, false, false, r.phase === 'AwaitAction' ? `${r.spinsLeft} LEFT` : '---');
    this.updateArrows();
  }

  /** The keys that do something right now, where the player is looking: [KEY] ACTION. */
  private stationHint(): string {
    const g = this.game;
    if (!g) return '';
    const r = g.run;
    const st = this.stage.rig.station;
    if (r.phase === 'PhoneCall' && !this.phoneAnswered) return 'THE PHONE IS RINGING · LOOK LEFT · [ENTER] ANSWER';
    if (r.phase === 'Shop') {
      if (st === 'right') return '[1-6] BUY · [R] REROLL · [X] REMOVE · [G] GILD · [+/-] RESIZE · [N] DONE, NEXT DEADLINE';
      return 'THE PRIZE CABINET IS OPEN · LOOK RIGHT [→] · [N] DONE, NEXT DEADLINE';
    }
    if (r.phase !== 'AwaitAction') return '';
    if (st === 'center') return `[HOLD SPACE] SPIN · OR DRAG THE WHEEL${g.canGamble() ? ' · [D] DOUBLE OR NOTHING' : ''} · [↓] TRAY & VAULT`;
    if (st === 'down') return `[ENTER] DEPOSIT THE TRAY${r.scratch.length ? ' · [1-3] SCRATCH A CARD' : ''} · [↑] BACK TO THE WHEEL`;
    if (st === 'left') return r.artifacts.length ? '[1-6] SELECT AN ARTIFACT · [,/.] MOVE IT · [X][X] SELL · [→] WHEEL' : 'YOUR SHELF: ARTIFACTS GO HERE · [→] WHEEL';
    return 'THE CABINET OPENS AFTER EACH DEADLINE · [←] WHEEL';
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
    const shortLast = r.phase === 'AwaitAction' && r.spinsLeft === 1 && r.vault + r.tray < r.debt;
    this.music.setTrack(r.phase === 'PhoneCall' ? 'phone' : r.phase === 'Shop' || r.phase === 'Conversion' || r.phase === 'WedgeReplace' ? 'shop' : shortLast ? 'deadline' : 'main');
    if (r.phase !== 'AwaitAction') this.stopHeartbeat();
    switch (r.phase) {
      case 'PackageSelect':
        if (this.introShownFor !== r.deadline) await this.deadlineIntro();
        this.fsm.force('PackageSelect');
        this.showPackages();
        break;
      case 'AwaitAction':
        this.fsm.force('AwaitAction');
        this.setChoice(null, null);
        this.hud.hint = this.stationHint();
        if (r.spinsLeft === 1 && this.lastSpinSaid !== r.deadline * 1000 + r.spinsLeft) {
          this.lastSpinSaid = r.deadline * 1000 + r.spinsLeft;
          this.hostSay('lastSpin', 'nervous', 'point');
          this.hud.showBanner('LAST SPIN', r.vault + r.tray >= r.debt ? 'THE DEBT IS COVERED' : `$${r.debt - r.vault - r.tray} SHORT`, r.vault + r.tray >= r.debt ? '#80ff80' : '#ff5040', 1.8 / this.speed);
          if (r.vault + r.tray < r.debt) this.loops.heart ??= this.sfx.loop('heartbeat', 0.5, 'sfx', 1.5);
        }
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
        this.hud.hint = this.stationHint();
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
      this.stage.rig.craneIn();
      this.stage.lights.setMode('party');
      this.stage.lights.applause = 1.6;
      this.stage.post.shock = 0.3;
      const mut = mutatorDef(r.mutator);
      const title = r.deadline > BALANCE.deadlinesPerRun ? `ENDLESS ${r.deadline}` : `DEADLINE ${r.deadline}`;
      this.hud.showBanner(title, `THE NETWORK WANTS $${r.debt}`, mut ? '#ff5040' : '#ffd040', 2.6 / this.speed);
      this.stage.marquee.set(`DEADLINE ${r.deadline} — $${r.debt} DUE`, '#ffd040', true);
      this.sfx.play('sting', { gain: 0.6 });
      if (r.deadline > BALANCE.deadlinesPerRun) this.hostSay('endless', 'grin', 'present');
      else if (r.deadline === 1 && Math.random() < 0.5) this.hostSay('intro', 'grin', 'present');
      else this.hostSay(mut ? 'sweep' : 'package', 'grin', 'present', DEADLINE_LINES[r.deadline - 1]);
      await wait(1.6 / this.speed);
      const chal = g.challenge();
      if (chal) {
        this.hud.showBanner(`SPONSOR: ${chal.def.name}`, `${challengeText(chal.def, r).toUpperCase()} — +${chal.def.reward} TOK`, '#ffc040', 2.2 / this.speed);
        this.sfx.play('blip', { pitch: 1.5, gain: 0.4 });
        await wait(1.4 / this.speed);
      }
      if (mut) {
        this.hud.showBanner(`SWEEPS: ${mut.name}`, mut.text, '#ff5040', 3 / this.speed);
        this.stage.post.roll = 0.6;
        this.sfx.play('buzz', { gain: 0.4 });
        this.sfx.play('static', { gain: 0.5 });
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
    if (!g || g.run.phase !== 'AwaitAction' || this.busy || this.charge || this.grab || this.menus.open || this.hud.choice || this.target || this.stage.wheel.busy) return;
    if (this.stage.rig.station !== 'center') this.stage.rig.go('center');
    this.charge = { t: 0, power: 0, peek: false, previewAt: null, lastTick: 0 };
    this.loops.drum?.stop(0.05);
    const rate = this.music.rate * (0.97 + Math.random() * 0.06);
    this.loops.drum = this.sfx.loop(this.sfx.pickTension(), 0.6, 'sfx', 0.25, false, rate) ?? this.sfx.loop('drumroll', 0.32, 'sfx', 0.3);
    this.fsm.force('Charging');
    this.hud.hint = g.canPeek() ? '[RELEASE] SPIN AT THIS POWER · [E] PEEK WHERE IT LANDS' : '[RELEASE] SPIN AT THIS POWER';
    this.updateArrows();
  }

  private async releaseCharge(): Promise<void> {
    const c = this.charge;
    if (!this.game || !c) return;
    this.charge = null;
    this.stage.lever.pull = 0;
    this.stage.wheel.showHighlight(null);
    this.hud.hint = '';
    await this.doSpin(c.power, c.peek);
  }

  private async doSpin(power: number, peek: boolean, opts: { startAngle?: number; source?: 'lever' | 'hand'; omega?: number } = {}): Promise<void> {
    const g = this.game!;
    const hand = opts.source === 'hand';
    await this.withBusy(async () => {
      this.fsm.force('Spinning');
      this.hud.payout = null;
      this.stage.rig.dollyTarget = 1;
      if (g.run.spinsLeft > this.spinsMax || this.spinsMaxFor !== g.run.deadline) {
        this.spinsMax = g.run.spinsLeft;
        this.spinsMaxFor = g.run.deadline;
      }
      const outcome = g.spin(power, { peek, startAngle: opts.startAngle, omega: opts.omega });
      if (!hand) {
        this.sfx.play('lever', { gain: 0.8 });
        this.stage.lever.pull = 1;
        setTimeout(() => (this.stage.lever.pull = 0), 250);
      }
      // Dramatic finishes (decided now; the outcome is already known) get a slow-motion close-up.
      this.drama = this.settings.fastMode ? null : this.dramaFor(outcome);
      this.stage.marquee.set('SPINNING…', '#ffe060');
      // Wheel layout at spin time (Static jackpots etc. are already visible).
      this.stage.wheel.setLayout(outcome.layout, outcome.ring, (s) => segmentLabel(g, s));
      this.layoutSig = '';
      const st = this.stage;
      if (!hand && !this.settings.fastMode) {
        // Wind-up: the wheel rocks back against the brake, the camera draws breath, then — go.
        const th = st.wheel.theta;
        this.sfx.play('ratchet', { gain: 0.45, pitch: 0.7 });
        st.rig.punch(3);
        await st.wheel.rotateTo(th - 9, 0.2);
        this.sfx.play('whoosh', { gain: 0.6 });
        st.rig.punch(-5);
        await st.wheel.rotateTo(th, 0.05);
      } else if (hand) st.rig.punch(-4);
      await this.stage.wheel.playTrace(outcome.sim.trace, {
        hang: outcome.sim.hang,
        onTick: (t) => {
          this.sfx.tick(t.speed);
          this.stage.wheel.kickFlapper();
        },
      });
      this.endSlowMo();
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

  /** Which spins earn the slow-motion finish: Jackpot, Bankrupt, a big win, or a near miss. */
  private dramaFor(o: ReturnType<Game['spin']>): NonNullable<App['drama']> | null {
    const segs = o.layout.segments;
    const n = segs.length;
    const i = o.sim.outerIndex;
    const s = segs[i];
    const cash = o.resolution?.payout.cash ?? 0;
    let kind: NonNullable<App['drama']>['kind'] | null = null;
    if (s.kind === 'jackpot') kind = 'jackpot';
    else if (s.kind === 'bankrupt') kind = 'bankrupt';
    else if (cash >= Math.max(400, this.game!.run.debt * 0.4)) kind = 'big';
    else {
      // A near miss: it stops within 3° of a Jackpot or a Bankrupt next door.
      const local = mod360(-o.sim.finalAngle);
      const hot = (x: { kind: string }) => x.kind === 'jackpot' || x.kind === 'bankrupt';
      const prev = segs[(i - 1 + n) % n],
        next = segs[(i + 1) % n];
      if ((hot(prev) && mod360(local - s.start) < 3) || (hot(next) && mod360(s.end - local) < 3)) kind = 'near';
    }
    return kind ? { at: kind === 'near' ? 0.7 : 0.95, started: false, kind, beds: [] } : null;
  }

  /** Slow motion in: the clock drops, the camera pushes onto the pointer, letterbox, heartbeat. */
  private startSlowMo(): void {
    const dr = this.drama;
    if (!dr || dr.started) return;
    dr.started = true;
    const st = this.stage;
    this.timeScaleTarget = 0.32;
    st.audience.watchTarget = st.wheel.pointerTipWorld();
    st.audience.watchWeight = 1;
    // Aim just below the glove so the wedges ticking past it fill the shot.
    const look = st.wheel.pointerTipWorld().add(new THREE.Vector3(0, -0.3, 0));
    st.rig.focus(look, { push: 0.3, fov: 34, roll: dr.kind === 'bankrupt' ? -0.06 : 0.05, in: 0.5, hold: Infinity });
    this.hud.letterboxTarget = 1;
    this.mixer.setMuffle(0.45);
    this.music.setLevel(0.35, 0.4);
    this.sfx.play('riser', { gain: 0.7 });
    const hb = this.sfx.loop('heartbeat', 0.8, 'sfx', 0.1);
    if (hb) dr.beds.push(hb);
  }

  /** Slow motion out, on the landing: a hard cut back to speed with an impact. */
  private endSlowMo(): void {
    const dr = this.drama;
    this.drama = null;
    if (!dr || !dr.started) return;
    const st = this.stage;
    this.timeScaleTarget = 1;
    this.timeScale = 1;
    setTimeout(() => (st.audience.watchWeight = 0.15), 1800);
    for (const b of dr.beds) b.stop(0.3);
    this.mixer.setMuffle(0);
    this.music.setLevel(1, 0.6);
    this.hud.letterboxTarget = 0;
    this.hitstop = Math.max(this.hitstop, 0.12);
    this.sfx.play('impact', { gain: 0.9, pitch: dr.kind === 'bankrupt' ? 0.75 : 1 });
    st.rig.punch(-7);
    if (this.settings.screenShake) st.rig.shake(0.45);
    st.post.shock = Math.max(st.post.shock, this.settings.reducedFlashing ? 0.25 : 0.6);
    this.hud.impact(dr.kind === 'bankrupt' ? '#000' : '#fff', 2);
    setTimeout(() => {
      st.rig.release(0.5);
      this.sfx.play('whoosh', { gain: 0.35, pitch: 0.8 });
    }, 650);
    // A reaction shot: whip to the host for the big ones.
    if (dr.kind === 'jackpot' || dr.kind === 'big') {
      setTimeout(() => {
        this.sfx.play('whoosh', { gain: 0.5, pitch: 1.2 });
        st.rig.whip(1);
        st.rig.focus(st.host.headWorld(), { push: 0.32, fov: 30, in: 0.25, hold: 1.1, out: 0.4 });
      }, 1250);
    }
  }

  /** World point → internal-resolution pixel. */
  private toScreen(v: THREE.Vector3): { x: number; y: number } {
    const p = v.clone().project(this.stage.rig.camera);
    return { x: (p.x * 0.5 + 0.5) * this.stage.post.width, y: (-p.y * 0.5 + 0.5) * this.stage.post.height };
  }

  // ===================================================================================
  // Grab the wheel (mouse): drag it round, flick it clockwise, let go.
  // ===================================================================================
  private canGrab(): boolean {
    const g = this.game;
    return !!g && g.run.phase === 'AwaitAction' && !this.busy && !this.charge && !this.grab && !this.menus.open && !this.hud.choice && !this.target && !this.stage.wheel.busy;
  }

  private startGrab(): void {
    const st = this.stage;
    const m = this.input.mouse;
    const c = this.toScreen(st.wheel.centerWorld());
    this.grab = { ang: Math.atan2(m.y - c.y, m.x - c.x) / DEG, theta: st.wheel.theta, samples: [{ t: this.time, th: st.wheel.theta }], seg: -1 };
    this.sfx.play('clunk', { gain: 0.6 });
    st.rig.punch(-1.5);
    this.hud.hint = 'FLICK IT CLOCKWISE AND LET GO';
    this.updateArrows();
  }

  /** Angular speed of the hand over the last ~0.12 s, degrees per second (clockwise +). */
  private grabOmega(): number {
    const sm = this.grab?.samples ?? [];
    if (sm.length < 2) return 0;
    const a = sm[0],
      b = sm[sm.length - 1];
    const dt = b.t - a.t;
    return dt > 0.015 ? (b.th - a.th) / dt : 0;
  }

  private updateGrab(): void {
    const gr = this.grab!;
    const g = this.game!;
    const st = this.stage;
    const m = this.input.mouse;
    const c = this.toScreen(st.wheel.centerWorld());
    const a = Math.atan2(m.y - c.y, m.x - c.x) / DEG;
    const d = mod360(a - gr.ang + 180) - 180;
    // Right over the hub the angle jumps about: only turn the wheel from a few pixels out.
    if (Math.hypot(m.x - c.x, m.y - c.y) > 6 * st.post.scale) gr.theta += d;
    gr.ang = a;
    st.wheel.theta = gr.theta;
    gr.samples.push({ t: this.time, th: gr.theta });
    while (gr.samples.length > 2 && this.time - gr.samples[0].t > 0.12) gr.samples.shift();
    st.lever.drawGauge(grabPower(this.grabOmega()), true, false);
    // Pegs click past the pointer as the wheel is dragged.
    const L = g.layout();
    const seg = segmentAt(L, st.wheel.pointerLocal());
    if (gr.seg >= 0 && seg !== gr.seg) {
      this.sfx.tick(Math.min(1, Math.abs(d) / 8));
      st.wheel.kickFlapper();
    }
    gr.seg = seg;
  }

  private releaseGrab(): void {
    const g = this.game;
    if (!this.grab || !g) return;
    const omega = this.grabOmega();
    const theta = this.grab.theta;
    this.grab = null;
    this.hud.hint = '';
    if (omega >= GRAB_MIN && g.run.phase === 'AwaitAction') {
      const power = grabPower(omega);
      this.sfx.play('whoosh', { gain: 0.8, pitch: 0.8 + power * 0.5 });
      // The wheel leaves your hand at the speed your hand was moving.
      void this.doSpin(power, false, { startAngle: theta, source: 'hand', omega });
    } else {
      // Too feeble (or backwards): the wheel springs back to where it was.
      this.sfx.play('boing', { gain: 0.55 });
      this.hud.toast(omega <= -GRAB_MIN ? 'THE OTHER WAY!' : 'PUT SOME ARM INTO IT!', '#ffd040');
      void this.stage.wheel.rotateTo(g.run.wheelAngle, 0.45);
      this.updateArrows();
    }
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
    if (p.landedKind) this.hud.stamp(`wedge.${p.resolvedKind ?? p.landedKind}`);
    // Step-by-step marquee with rising pitch.
    let acc = '';
    for (let i = 0; i < steps.length; i++) {
      acc = acc ? `${acc} → ${steps[i].label}` : steps[i].label;
      const isCombo = steps[i].op === 'combo';
      st.marquee.set(steps[i].label.slice(0, 21), isCombo ? '#ff70ff' : '#ffe060', isCombo);
      this.sfx.play(isCombo ? 'sting' : 'blip', { pitch: 1 + i * 0.12, gain: isCombo ? 0.5 : 0.35 });
      if (steps[i].slot !== undefined) st.shelf.trigger(steps[i].slot!);
      await wait((isCombo ? 0.45 : 0.28) / sp);
    }
    if (p.cash > 0 || p.isCash) {
      // Count up the final number.
      const n = Math.max(6, Math.min(20, Math.round(Math.log2(p.cash + 2) * 2)));
      for (let k = 1; k <= n; k++) {
        st.marquee.set(`= $${Math.round((p.cash * k) / n)}`, '#80ff80');
        // The HUD carries just the number; the breakdown is on the studio marquee.
        this.hud.payout = { text: `+$${Math.round((p.cash * k) / n)}`, color: '#c0ffc0' };
        this.sfx.play('nixie', { pitch: 0.8 + (k / n) * 1.4, gain: 0.4 });
        await wait(0.035 / sp);
      }
    } else st.marquee.set(p.marquee.length > 30 ? p.marquee.slice(0, 30) : p.marquee, '#ffe060');
    for (const c of res.combos) {
      if (c === 'deadAir') continue;
      st.vfx.float(st.wheel.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)), COMBO_NAMES[c], '#ff70ff', 2, 1.6);
    }
    this.playHorror(this.pendingHorror.splice(0));
    if (p.landedKind === 'bleeder') this.hostSay('bleeder', 'grin', 'point');
    if (res.combos.includes('hatTrick')) this.hostSay('hatTrick', 'shock', 'cheer');
    else if (res.combos.includes('neighbors') && Math.random() < 0.5) this.hostSay('neighbors', 'shock', 'point');
    else if (res.combos.includes('echo') && Math.random() < 0.5) this.hostSay('combo', 'grin', 'cheer');

    // Notes (prize effects).
    const tally = new Map<string, number>();
    for (const n of res.notes) tally.set(n, (tally.get(n) ?? 0) + 1);
    for (const [n, c] of [...tally].slice(0, 4)) this.hud.toast(c > 1 ? `${n} ×${c}` : n);

    const big = p.cash >= Math.max(500, g.run.debt * 0.5);
    st.rig.dollyTarget = 0;
    // The tension cue ends when the wheel lands.
    this.loops.drum?.stop(0.35);
    this.loops.drum = null;
    if (p.bankrupt && !p.bankruptBlocked) await this.bankruptDrama(p.trayLost, p.deadAir);
    else if (p.bankruptBlocked) {
      this.hud.toast('BANKRUPT BLOCKED!', '#80ffff');
      this.sfx.play('thunk', { gain: 0.6, pitch: 1.4 });
    }
    if (p.cash > 0) {
      if (big) {
        // 3D juice by size: shockwave and sparks; money and light for the huge ones.
        const tier = p.cash >= g.run.debt ? 'huge' : 'big';
        st.juice.reducedFlashing = this.settings.reducedFlashing;
        st.juice.play(tier, st.wheel.centerWorld(), st.wheel.pointerTipWorld());
        if (tier === 'huge') {
          st.coins.burst(st.wheel.centerWorld().add(new THREE.Vector3(0, 0, 0.3)), 30, 2.4, 0.2);
          st.wheel.lightShow('jackpot', 2.5);
        }
        this.hitstop = 0.18;
        if (this.settings.screenShake) st.rig.shake(0.5);
        st.rig.punch(-6);
        st.post.shock = 0.5;
        st.lights.setMode('party');
        st.lights.applause = 2.5;
        this.sfx.play('cheer', { gain: 0.6 });
      } else if (p.cash >= 150) {
        st.rig.punch(-2.5);
        st.lights.applause = 1.2;
      }
      this.sfx.play('cascade', { gain: Math.min(1, 0.3 + p.cash / 1500), pitch: 1 });
      st.coins.burst(st.tray.group.position.clone().add(new THREE.Vector3(0, 0.15, 0)), Math.min(40, 4 + Math.round(p.cash / 25)));
      if (big || p.cash >= 200) st.wheel.lightShow('win');
    }
    if (p.resolvedKind === 'jackpot' || p.landedKind === 'jackpot') {
      this.sfx.play('jackpot', { gain: 0.8 });
      if (!this.settings.reducedFlashing) st.vfx.confetti(st.post.width, 100);
      st.studio.accent.color.setRGB(1.2, 1.0, 0.3);
      st.rig.punch(-9);
      st.post.shock = 0.8;
      st.post.flashColor.setRGB(1, 0.85, 0.4);
      st.post.flashAmt = this.settings.reducedFlashing ? 0.15 : 0.45;
      st.lights.setMode('party');
      st.lights.applause = 3.5;
      st.wheel.lightShow('jackpot', 3.5);
      st.coins.rain(90);
      st.juice.reducedFlashing = this.settings.reducedFlashing;
      st.juice.play('jackpot', st.wheel.centerWorld(), st.wheel.pointerTipWorld());
      st.studio.accent.pos.set(0, 2.5, 0.5);
      setTimeout(() => st.studio.accent.color.setRGB(0, 0, 0), 1500);
      this.hostSay('jackpot', 'shock', 'cheer');
    } else if (big) this.hostSay('bigWin', 'grin', 'cheer');
    else if (p.landedKind === 'dud') {
      this.sfx.play('rimshot', { gain: 0.55 });
      if (Math.random() < 0.35) this.sfx.play('laugh', { gain: 0.35, pitch: 0.85, delay: 0.5 });
      if (Math.random() < 0.5) this.hostSay('dud', Math.random() < 0.5 ? 'wink' : 'nervous', 'shrug');
    }
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
    st.wheel.sunMood = 'gloat';
    setTimeout(() => (st.wheel.sunMood = 'idle'), 4000);
    this.sfx.play('bankrupt', { gain: 0.9 });
    if (this.settings.screenShake) st.rig.shake(1);
    st.rig.tilt(0.12 * (Math.random() < 0.5 ? -1 : 1), 1.4);
    st.rig.punch(5);
    st.post.shock = 1;
    st.lights.setMode('alarm');
    st.wheel.lightShow('bankrupt', 1.8);
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
    if (lost >= 300) this.sfx.play('gasp', { gain: 0.5 });
    if (Math.random() < 0.3) this.sfx.play('laugh', { gain: 0.3, pitch: 0.7, delay: 1.2 });
    if (lost > 0) st.vfx.float(st.tray.group.position.clone().add(new THREE.Vector3(0, 0.4, 0)), `-$${lost}`, '#ff4040', 1, 1.8);
    st.marquee.set(deadAir ? 'DEAD AIR' : 'BANKRUPT', '#ff3020', true);
    this.hostSay('bankrupt', 'laugh', 'shrug');
    // The dead applaud. On DEAD AIR they get to their feet.
    st.audience.clap(2.6);
    this.sfx.play('boneclap', { gain: 0.5, delay: 0.3 });
    if (deadAir) {
      st.audience.standAll(4);
      this.sfx.play('seats', { gain: 0.7, delay: 0.2 });
    }
    if (deadAir) {
      this.sfx.play('static', { gain: 0.6 });
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
    const full = g.run.artifacts.length >= g.maxArtifacts();
    this.setChoice(
      {
        title: 'A PRIZE FROM THE PROP ROOM — PICK ONE',
        lines: full ? ['YOUR SHELF IS FULL: PICKING WILL REPLACE AN ARTIFACT.'] : [],
        options: [
          ...p.options.map((id) => {
            const d = artifactDef(id);
            return { icon: `artifact.${id}`, label: d.name.toUpperCase(), detail: `(${d.rarity.toUpperCase()}) ${d.text}`, color: d.rarity === 'cursed' ? '#c080ff' : d.rarity === 'rare' ? '#ffd040' : d.rarity === 'uncommon' ? '#80d0ff' : '#ffffff' };
          }),
          { label: 'SKIP', detail: 'Leave them on the shelf.' },
        ],
        selected: 0,
        layout: 'cards',
        inspect: true,
        footer: '1-4 OR CLICK · HOVER OR SELECT TO INSPECT',
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
        inspect: true,
        options: g.run.artifacts.map((a) => {
          const d = artifactDef(a.id);
          return { label: d.name.toUpperCase(), detail: `(${d.rarity.toUpperCase()}) ${d.text}` };
        }),
        selected: 0,
        layout: 'list',
        footer: '1-6 · HOVER OR SELECT TO INSPECT · BACKSPACE BACK',
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
    this.hud.hint = this.stationHint();
    this.setChoice(null, null);
    if (g.run.phone?.reason !== 'secret') this.hostSay('phone', 'shock', 'point');
    if (g.run.phone?.reason === 'collateral') this.stage.collateral.setStrain(1);
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
    this.stage.lights.setMode('tense');
    this.music.setLevel(0.25);
    this.hud.hint = '';
    const ph = g.run.phone!;
    this.sfx.play('static', { gain: 0.2, pitch: 1.3 });
    const secret = ph.reason === 'secret';
    // The caller pitches each deal in turn; choosing anything cuts them off.
    let at = this.producerSay(ph.intro, secret) + 0.5;
    for (const o of ph.offers) {
      const line = bargainDef(o.bargainId).line;
      if (!this.vo.has(secret ? 'secret' : 'producer', line)) continue;
      const delay = at;
      this.phoneTalk.push(window.setTimeout(() => this.producerSay(line, secret), delay * 1000));
      at += this.vo.duration(secret ? 'secret' : 'producer', line) + 0.6;
    }
    this.showPhoneOffers();
  }

  private showPhoneOffers(): void {
    const g = this.game!;
    const ph = g.run.phone!;
    const secret = ph.reason === 'secret';
    const nameOf = (id: string) => artifactDef(id).name;
    this.setChoice(
      {
        title: secret ? 'THE OTHER LINE' : ph.reason === 'deadAir' ? 'THE PRODUCER — DEAD AIR' : ph.reason === 'collateral' ? 'THE PRODUCER — PAYMENT IN KIND' : 'THE PRODUCER',
        portrait: secret ? 'caller.secret' : 'caller.producer',
        lines: [ph.intro],
        options: [
          ...ph.offers.map((o, i) => {
            const b = bargainDef(o.bargainId);
            return { label: `OFFER ${i + 1}`, detail: fillDeal(b.deal, o.params, nameOf), color: secret ? '#d0a0ff' : '#ffb080' };
          }),
          { label: 'HANG UP', detail: secret ? 'Click.' : ph.reason === 'collateral' ? 'The floor opens.' : 'He will remember.' },
        ],
        selected: 0,
        layout: 'list',
        inspect: true,
        accent: secret ? '#c080ff' : '#ff8040',
        footer: '1-3 OR CLICK · HOVER OR SELECT TO INSPECT',
      },
      (i) => {
        this.phoneTalk.forEach((t) => clearTimeout(t));
        this.phoneTalk = [];
        this.setChoice(null, null);
        this.stage.phone.offHook = 0;
        this.stage.post.roll = 0;
        this.music.setLevel(1, 1.5);
        if (ph.reason === 'collateral' && i < ph.offers.length) {
          // Payment in kind: the deal closes on screen before the books do.
          const part = ph.offers[i].bargainId === 'collateral_eye' ? 'eye' : 'finger';
          this.producerSay(PRODUCER_ACCEPT[Math.floor(Math.random() * PRODUCER_ACCEPT.length)], false);
          this.phoneAnswered = false;
          void this.withBusy(async () => {
            await this.payInKind(part);
            g.phoneAccept(i);
          }).then(() => this.enterPhase());
          return;
        }
        if (i < ph.offers.length) {
          const b = bargainDef(ph.offers[i].bargainId);
          const d = this.producerSay(secret ? SECRET_ACCEPT : PRODUCER_ACCEPT[Math.floor(Math.random() * PRODUCER_ACCEPT.length)], secret);
          if (!secret) setTimeout(() => !this.vo.speaking && this.game && this.hostSay('dealTaken', 'grin', 'point'), (d + 0.5) * 1000);
          g.phoneAccept(i);
          this.hud.toast('DEAL.', '#ff9060');
          void b;
          this.layoutSig = '';
        } else {
          g.phoneHangUp();
          const d = secret ? 0 : this.producerSay(PRODUCER_HANGUP[Math.floor(Math.random() * PRODUCER_HANGUP.length)], false);
          setTimeout(() => {
            this.vo.stop();
            this.sfx.play('hangup');
            this.sfx.play('static', { gain: 0.15, pitch: 1.6 });
            if (!secret) setTimeout(() => this.game && this.hostSay('dealRefused', 'angry', 'point'), 500);
          }, Math.max(0, d - 0.2) * 1000);
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
      this.music.setTrack('deadline');
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
      if (e.refused) {
        // The collateral call was refused: nothing more to say.
        this.sync(false);
        return;
      }
      st.marquee.set(`PAYMENT DUE: $${e.debt}`, '#ffd040', true);
      if (e.inKind) this.hud.showBanner('PAID IN KIND', e.inKind === 'eye' ? 'ONE EYE TO THE NETWORK' : 'ONE FINGER TO THE NETWORK', '#ff6040', 2.4);
      else if (e.collateral) this.hud.showBanner('SHORT', 'THE PHONE IS RINGING', '#ff3020', 2.2);
      else this.hud.showBanner(e.paid ? 'PAID' : 'SHORT', e.paid ? `$${e.debt} TO THE NETWORK` : `VAULT $${e.vaultBefore} OF $${e.debt}`, e.paid ? '#80ff80' : '#ff3020', 2.2);
      if (e.paid) {
        this.sfx.play('register', { gain: 0.6 });
        st.vault.setVault(e.vaultAfter);
        st.vault.shake = 0.4;
        this.sfx.play('thunk', { pitch: 0.8 });
        this.sfx.play('applause', { gain: 0.4 });
        st.lights.applause = 2;
        if (e.saved) this.hud.toast('THE TRAPDOOR LEVER SAVED YOU', '#ffd040');
        this.hostSay('debtPaid', 'grin', 'cheer');
        // The round economy: what was left over becomes Tokens, Tokens held earn interest.
        if (e.surplusTokens) {
          this.hud.toast(`LEFTOVER → +${e.surplusTokens} TOKENS`, '#ffd040');
          this.sfx.play('cascade', { gain: 0.45, pitch: 1.3, delay: 0.3 });
        }
        if (e.interestTokens) this.hud.toast(`TOKEN INTEREST +${e.interestTokens}`, '#c0ff80');
        await wait(1.6 / this.speed);
      } else {
        this.hostSay('debtMissed', this.game && this.game.run.deadline >= 5 ? 'melt' : 'sad', 'slump');
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
      this.stopHeartbeat();
      this.music.tapeStop(1.8);
      st.rig.go('center', 0.4);
      await wait(0.4);
      // Lights die one by one.
      st.wheel.bulbsOn = 0;
      this.sfx.play('powerup', { pitch: 0.5, gain: 0.5 });
      await wait(0.4);
      st.studio.spotLevel = 0;
      st.lights.setMode('off');
      st.lights.onAir = false;
      await wait(0.4);
      st.studio.lightLevel = 0.15;
      st.host.expression = 'dead';
      this.hostSay('gameOver', 'dead', 'slump');
      await wait(0.6);
      this.sfx.play('trapdoor', { gain: 1 });
      this.sfx.play('gameoverCue', { gain: 0.8, delay: 0.5, jitter: 0, pitch: this.music.rate });
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
      this.sfx.play('signoff', { gain: 0.5, delay: 2.2 });
    });
    const r = g.run;
    if (!r.marks.metaApplied) {
      r.marks.metaApplied = 1;
      const res = applyRun(this.meta, r);
      this.saveMeta();
      this.menus.showSummary(false, r.deadline, res.ratings, res.newUnlocks, false);
    }
    this.game = null;
    this.hud.ticker = '';
    this.hud.chyron = null;
  }

  private async victory(): Promise<void> {
    const g = this.game!;
    const st = this.stage;
    await this.withBusy(async () => {
      this.fsm.force('Victory');
      st.rig.go('center', 0.5);
      this.sfx.play('fanfare', { gain: 0.8 });
      st.lights.setMode('party');
      st.lights.applause = 5;
      st.rig.punch(-8);
      this.sfx.play('applause', { gain: 0.8, delay: 0.6 });
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
    // Say plainly why the view went to the wheel, and how to get back.
    this.stage.rig.go('center', 0.55);
    this.hud.cancelLabel = mode === 'replace' ? 'CANCEL · BACK TO SHOP' : 'CANCEL';
    this.hud.showBanner(
      mode === 'replace' ? 'PLACE YOUR WEDGE' : mode.toUpperCase(),
      mode === 'replace' ? 'CLICK THE WEDGE IT REPLACES' : 'CLICK A WEDGE ON THE WHEEL',
      '#80d0ff',
      1.8,
    );
    this.hud.hint = `${mode.toUpperCase()}: [←/→] OR CLICK A WEDGE · [ENTER] CONFIRM · [BACKSPACE] CANCEL`;
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
    if (seg) this.hud.hint = `${this.target.mode.toUpperCase()} → ${WEDGES[seg.kind].name.toUpperCase()}${seg.kind === 'cash' ? ` $${Math.round(g.cashValueOf(seg))}` : ''} · [ENTER] CONFIRM · [BACKSPACE] CANCEL`;
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
    this.hud.cancelLabel = null;
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
  }

  private onAction(a: Action): void {
    if (this.menus.open) {
      // Escape closes the pause menu; every other input belongs to the open menu.
      if (a.type === 'pause' && this.menus.page === 'pause') this.resume();
      return;
    }
    if (this.fsm.state === 'Boot') return;
    const g = this.game;
    this.lastInput = this.time;
    if (a.type === 'pause') {
      if (this.target) return this.endTarget();
      if (g) {
        if (this.charge) {
          this.charge = null;
          this.stage.lever.pull = 0;
          this.stage.wheel.showHighlight(null);
          this.fsm.force('AwaitAction');
          this.updateArrows();
        }
        if (this.grab) {
          this.grab = null;
          void this.stage.wheel.rotateTo(g.run.wheelAngle, 0.3);
        }
        this.loops.drum?.stop(0.1);
        this.loops.drum = null;
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
      if (this.grab) this.releaseGrab();
      else if (this.charge) void this.releaseCharge();
      return;
    }
    if (this.grab) return;
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
        this.choiceSel = (this.hud.activeChoiceIndex() - 1 + n) % n;
        this.hud.selectChoice(this.choiceSel);
        this.sfx.play('blip', { gain: 0.3 });
        return;
      }
      if (a.type === 'nav' && (a.dir === 'right' || a.dir === 'down')) {
        this.choiceSel = (this.hud.activeChoiceIndex() + 1) % n;
        this.hud.selectChoice(this.choiceSel);
        this.sfx.play('blip', { gain: 0.3 });
        return;
      }
      if (a.type === 'confirm') return this.pickChoice(this.hud.activeChoiceIndex());
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
        // The cancel pill, a right click, or a click off the wheel all go back to the shop.
        if (this.hud.hitCancel(a.x, a.y) || a.button === 2) return this.endTarget();
        const hit = this.stage.pick(a.x, a.y);
        if (hit && hit.id !== 'wheel') return this.endTarget();
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
      this.hud.hint = this.target ? this.hud.hint : this.stationHint();
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
      if (k === 'd' && g.run.phase === 'AwaitAction') return this.offerGamble();
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
    this.lastInput = this.time;
    if (id === 'lever' && button === 0) return this.startCharge();
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
      if (this.stage.rig.station !== 'center') return this.stage.rig.go('center');
      if (button === 0 && id === 'wheel' && this.canGrab()) this.startGrab();
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
      if (before >= 200) this.sfx.play('register', { gain: 0.4, delay: 0.15 });
      if (res.lost) this.hud.toast(`LOST $${res.lost} ON THE WAY`, '#ff8060');
      if (res.keptStreak) this.hud.toast('STREAK KEPT', '#80ffff');
      if (Math.random() < 0.6) this.hostSay('deposit', 'talk', 'present');
    }
    this.sync(false);
  }

  /** Double or Nothing: confirm, then a drumroll and a coin flip on the marquee. */
  private offerGamble(): void {
    const g = this.game;
    if (!g || this.busy || this.charge || this.menus.open) return;
    if (!g.canGamble()) {
      this.sfx.play('error');
      this.hud.toast(g.run.marks.gambledAt === g.run.deadline ? 'ALREADY GAMBLED THIS DEADLINE' : `NEED $${BALANCE.gambleMin} IN THE TRAY`, '#ff8060');
      return;
    }
    const stake = g.run.tray;
    this.hostSay('gambleOffer', 'grin', 'present');
    this.stage.rig.go('center');
    this.setChoice(
      {
        title: 'DOUBLE OR NOTHING?',
        lines: [`STAKE THE WHOLE TRAY: $${stake}`, `EVEN ODDS. WIN: $${stake * 2}, STREAK STANDS. LOSE: $0, STREAK RESETS.`, 'ONCE PER DEADLINE.'],
        options: [
          { icon: 'ui.coin', label: `DOUBLE IT ($${stake * 2})`, detail: '50/50. The house always says it is fair.', color: '#ffd040' },
          { icon: 'ui.tray', label: 'WALK AWAY', detail: `Keep $${stake} riding.` },
        ],
        selected: 1,
        layout: 'cards',
        accent: '#ffd040',
        footer: '1-2 OR CLICK',
      },
      (i) => {
        this.setChoice(null, null);
        if (i === 0) void this.playGamble();
        else this.hud.toast('WALKED AWAY', '#c0c0c0');
      },
    );
  }

  private async playGamble(): Promise<void> {
    const g = this.game!;
    const st = this.stage;
    await this.withBusy(async () => {
      this.fsm.force('Resolving');
      const res = g.gamble();
      const drum = this.sfx.loop('drumroll', 0.45, 'sfx', 0.2);
      st.lights.setMode('tense');
      st.host.say('static', 2.2);
      // The marquee flips between the two outcomes, slowing down, and lands on the result.
      let delay = 0.06;
      let face = 0;
      while (delay < 0.32) {
        face ^= 1;
        st.marquee.set(face ? 'DOUBLE' : 'NOTHING', face ? '#ffd040' : '#ff4030', false);
        st.wheel.bulbsOn = face ? 1 : 0.3;
        this.sfx.play('nixie', { pitch: face ? 1.4 : 0.9, gain: 0.5 });
        await wait(delay / Math.max(1, this.speed * 0.7));
        delay *= 1.16;
      }
      drum?.stop(0.05);
      st.wheel.bulbsOn = 1;
      if (res.won) {
        st.marquee.set(`DOUBLE! $${res.tray}`, '#ffd040', true);
        this.sfx.play('jackpot', { gain: 0.8 });
        this.sfx.play('applause', { gain: 0.6, delay: 0.3 });
        st.rig.punch(-8);
        st.post.shock = 0.6;
        st.lights.setMode('party');
        st.lights.applause = 3;
        if (!this.settings.reducedFlashing) st.vfx.confetti(st.post.width, 70);
        st.vfx.float(st.tray.group.position.clone().add(new THREE.Vector3(0, 0.4, 0)), `+$${res.stake}`, '#80ff80', 2, 1.8);
        this.hostSay('gambleWin', 'shock', 'cheer');
      } else {
        st.marquee.set('NOTHING.', '#ff3020', true);
        this.sfx.play('bankrupt', { gain: 0.8 });
        this.sfx.play('groan', { gain: 0.6, delay: 0.4 });
        if (this.settings.screenShake) st.rig.shake(0.8);
        st.rig.tilt(0.1, 1.2);
        st.post.shock = 1;
        st.lights.setMode('alarm');
        st.tray.setAmount(0, false);
        st.vfx.float(st.tray.group.position.clone().add(new THREE.Vector3(0, 0.4, 0)), `-$${res.stake}`, '#ff4040', 2, 1.8);
        this.hostSay('gambleLose', 'laugh', 'shrug');
      }
      this.sync(true);
      await wait(1.2 / this.speed);
    });
    void this.enterPhase();
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
    if (Math.random() < 0.4) this.hostSay('scratch', 'grin', 'point');
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
    if (Math.random() < 0.5) this.hostSay('sell', 'wink', 'present');
    this.sync(false);
  }

  // ===================================================================================
  // Frame
  // ===================================================================================
  // ===================================================================================
  // The horror pass
  // ===================================================================================
  /** Wedge beats from the last spin, acted out on the wheel's props. */
  private playHorror(events: HorrorEvent[]): void {
    const st = this.stage;
    let ate = false;
    for (const e of events) {
      st.wedgeProps.event(e);
      const at = 'uid' in e ? st.wedgeProps.worldPos(e.uid) : null;
      switch (e.type) {
        case 'mouthEat':
          if (ate) break;
          ate = true;
          this.sfx.play('chew', { gain: 0.6 });
          if (at) st.vfx.float(at.clone().add(new THREE.Vector3(0, 0.15, 0.1)), `-$${e.amount}`, '#ff4040', 1, 1.2);
          break;
        case 'mouthVomit':
          this.sfx.play('retch', { gain: 0.8 });
          if (at) st.coins.burst(at.clone().add(new THREE.Vector3(0, 0, 0.1)), Math.min(40, 6 + Math.round(e.amount / 30)));
          this.hostSay('mouth', 'shock', 'point');
          break;
        case 'cleave':
          this.sfx.play('chop', { gain: 0.9, delay: 0.6 });
          setTimeout(() => {
            if (this.settings.screenShake) st.rig.shake(0.5);
            st.post.shock = Math.max(st.post.shock, 0.5);
          }, 600);
          this.hostSay('cleaver', 'grin', 'point');
          break;
        case 'bleed':
          this.sfx.play('drip', { gain: 0.5 });
          st.vfx.float(st.tray.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)), `-$${e.amount}`, '#c01010', 1, 1.2);
          break;
        case 'eyeOpen':
          this.sfx.play('blink', { gain: 0.6 });
          this.hostSay('eye', 'shock', 'present');
          break;
        case 'eyeShut':
          this.sfx.play('blink', { gain: 0.7, pitch: 0.7 });
          break;
        case 'stitchStrain':
          this.sfx.play('tear', { gain: 0.25, pitch: 1.5 });
          break;
        case 'stitchTear':
          this.sfx.play('tear', { gain: 0.8 });
          this.hostSay('stitchTear', 'laugh', 'shrug');
          break;
        default:
          break;
      }
    }
  }

  /** The finger or the eye, on camera. Censored cuts to snow before the worst of it. */
  private async payInKind(part: 'finger' | 'eye'): Promise<void> {
    const st = this.stage;
    const uncut = this.settings.uncut;
    st.collateral.uncut = uncut;
    this.music.setLevel(0.15, 0.6);
    st.lights.setMode('tense');
    const veil = (v: number) => (st.post.veil = uncut ? Math.max(st.post.veil, v) : 0);
    if (part === 'finger') {
      st.rig.go('down', 0.5);
      await wait(0.6);
      st.rig.focus(st.collateral.knuckle(), { push: 0.55, fov: 26, in: 0.6, hold: Infinity });
      this.sfx.play('crank', { gain: 0.4, pitch: 0.6 });
      await st.collateral.takeFinger({
        onSnap: () => {
          this.sfx.play('snap', { gain: 1 });
          if (this.settings.screenShake) st.rig.shake(0.8);
          st.post.shock = 1;
          this.hitstop = 0.15;
          if (uncut && !this.settings.reducedFlashing) {
            st.post.flashColor.setRGB(0.8, 0, 0);
            st.post.flashAmt = 0.5;
          }
        },
        snow: (v) => {
          st.post.snow = v;
          if (v > 0) this.sfx.play('static', { gain: 0.5 });
        },
        veil,
      });
      this.hud.fingersLost += 1;
      await wait(0.4);
      st.rig.release(0.6);
    } else {
      st.rig.go('center', 0.5);
      await wait(0.6);
      await st.collateral.takeEye(st.rig.camera, {
        onContact: () => {
          this.sfx.play('blink', { gain: 1, pitch: 0.8 });
          this.sfx.play('snap', { gain: 0.6, pitch: 1.3, delay: 0.1 });
          if (this.settings.screenShake) st.rig.shake(1);
          st.post.shock = 1;
          veil(1.2);
          if (!uncut) st.post.snow = 1;
        },
        snow: (v) => {
          st.post.snow = v;
          if (v > 0) this.sfx.play('static', { gain: 0.5 });
        },
      });
      // The patch settles in over the left of the picture, for the rest of the run.
      const t0 = performance.now();
      while (performance.now() - t0 < 900) {
        st.post.eyePatch = Math.min(1, (performance.now() - t0) / 900);
        await wait(1 / 60);
      }
      st.post.eyePatch = 1;
      st.post.snow = 0;
    }
    st.collateral.setStrain(0.6);
    st.lights.setMode('idle');
    this.music.setLevel(1, 2);
    this.hostSay('collateral', 'grin', 'cheer');
    this.sfx.play('boneclap', { gain: 0.5, delay: 0.4 });
    st.audience.clap(2);
    await wait(1.2);
  }

  /**
   * Policy 7. Late in the show, a silence at the wheel is Dead Air: the power dies, and when the
   * lights come back something in the studio has moved closer.
   */
  private async breachSilence(): Promise<void> {
    const g = this.game;
    if (!g) return;
    const st = this.stage;
    await this.withBusy(async () => {
      this.sfx.play('breaker', { gain: 0.9 });
      this.music.setLevel(0, 0.05);
      this.mixer.setMuffle(0.9);
      st.studio.lightLevel = 0;
      st.studio.spotLevel = 0;
      st.wheel.bulbsOn = 0;
      st.lights.setMode('off');
      st.post.snow = 0.08;
      await wait(1.4);
      const n = g.recordSilence();
      // It comes up on the side you can still see.
      st.audience.approach(Math.min(4, n), g.run.marks.eyeLost ? 1 : -1);
      st.host.slip(n % 3, 4);
      await wait(0.25);
      this.sfx.play('bulbpop', { gain: 0.5, pitch: 0.8 });
      st.studio.lightLevel = 0.6;
      await wait(0.08);
      st.studio.lightLevel = 0;
      await wait(0.3);
      st.studio.lightLevel = 1;
      st.studio.spotLevel = 1;
      st.wheel.bulbsOn = 1;
      st.post.snow = 0;
      st.lights.setMode('idle');
      this.mixer.setMuffle(0);
      this.music.setLevel(1, 3);
      this.hostSay('silence', 'wink', 'idle');
    });
    this.lastInput = this.time;
  }

  /** The Rot, every frame: decay, burst bulbs, the picture going off, slips, the silence rule. */
  private updateRot(dt: number): void {
    const st = this.stage;
    const g = this.game;
    const r = g ? rotOf(g.run) : 0;
    const uncut = this.settings.uncut;
    st.rot.rot = r;
    st.rot.uncut = uncut;
    st.collateral.uncut = uncut;
    st.wheel.bloody = uncut && r > 0.45;
    st.post.grain = 0.035 + r * 0.05;
    st.post.veil = Math.max(0, st.post.veil - dt * 0.3);
    // Marquee bulbs burst one by one past the halfway mark, and stay dead.
    const dead = g ? Math.floor(Math.max(0, r - 0.3) * 30) : 0;
    if (dead > this.bulbsDead && !this.menus.open) {
      this.bulbsDead++;
      st.wheel.deadBulbs = this.bulbsDead;
      this.sfx.play('bulbpop', { gain: 0.4, pitch: 0.9 + Math.random() * 0.3 });
      st.vfx.float(st.wheel.bulbWorld(st.wheel.deadBulb(this.bulbsDead - 1)), '*', '#fff0c0', 1, 0.4);
    } else if (dead < this.bulbsDead) st.wheel.deadBulbs = this.bulbsDead = dead;
    if (!g || this.menus.open) return;
    // The mask slips now and then once the show is rotten (and always behind a silence).
    if (r > 0.22 && !this.busy && !st.host.slipping && Math.random() < dt * (r - 0.15) * 0.05) {
      st.host.slip();
      this.sfx.play('static', { gain: 0.3, pitch: 0.7 });
      if (Math.random() < 0.35 && this.time >= this.speech.until) setTimeout(() => this.game && this.producerSay(SLIP_WHISPER, true), 200);
    }
    // Policy 7: from Deadline 3, four seconds of silence at the wheel is Dead Air.
    this.silenceCool = Math.max(0, this.silenceCool - dt);
    const quiet = g.run.phase === 'AwaitAction' && g.run.deadline >= 3 && !this.busy && !this.charge && !this.grab && !this.hud.choice && st.rig.station === 'center';
    if (!quiet) this.lastInput = this.time;
    if (quiet && this.silenceCool <= 0 && this.time - this.lastInput > 4) {
      this.silenceCool = 30;
      void this.breachSilence();
    }
  }

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
    const realDt = dt;
    this.timeScale += (this.timeScaleTarget - this.timeScale) * Math.min(1, realDt * 8);
    if (this.grab) this.updateGrab();
    // A dramatic finish: slow motion for the last stretch of the spin, then a hard cut back.
    if (this.drama && !this.drama.started && st.wheel.busy && st.wheel.timeLeft > 0 && st.wheel.timeLeft < this.drama.at) this.startSlowMo();
    if (this.drama?.started && st.wheel.timeLeft <= 0) this.endSlowMo();
    if (this.charge && g) {
      const refreshPreview = advanceCharge(this.charge, dt);
      const p = this.charge.power;
      st.lever.pull = p * 0.6;
      st.lever.drawGauge(p, true, this.charge.peek);
      if (Math.floor(this.charge.t * 14) !== this.charge.lastTick) {
        this.charge.lastTick = Math.floor(this.charge.t * 14);
        this.sfx.play('ratchet', { gain: 0.25, pitch: 0.8 + p });
      }
      if (refreshPreview) {
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
    this.updateMood(dt);
    st.host.mouthAmp = this.vo.speaking ? this.vo.amplitude() : -1;
    st.host.twitch = this.game ? Math.max(0, (this.game.run.deadline - 4) / 6) * (this.vo.speaking ? 1 : 0.3) : 0;
    st.wheel.reducedFlashing = this.settings.reducedFlashing;
    if (this.vo.speaking) st.host.talking = Math.max(st.host.talking, 0.15);
    st.post.roll = Math.max(g?.run.phase === 'PhoneCall' && !this.phoneAnswered ? 0.7 : 0, st.post.roll - dt * 0.4);
    if (this.settings.reducedFlashing) st.post.roll = Math.min(st.post.roll, 0.25);
    // The wheel rots with the show, and its sun keeps an eye on the player's hand.
    if (g) st.wheel.decay = Math.min(1, (g.run.deadline - 1) / 7);
    this.updateRot(dt);
    this.hud.calm = this.busy > 0 || !!this.drama || !!this.charge;
    // The key hint always matches where the player is looking (clicking objects moves the camera too).
    if (g && !this.target && !this.charge && !this.busy && !this.grab) this.hud.hint = this.stationHint();
    this.hud.quietFor = this.time - this.lastInput;
    this.hud.alwaysHints = this.meta.runs < 2 && (g?.run.deadline ?? 1) <= 1;
    {
      const c = this.toScreen(st.wheel.centerWorld());
      const lm = this.input.mouse;
      if (lm.inside && st.rig.station === 'center') {
        const dx = lm.x - c.x,
          dy = lm.y - c.y,
          d = Math.max(1, Math.hypot(dx, dy));
        st.wheel.sunLook = { x: dx / d, y: dy / d };
      } else st.wheel.sunLook = { x: 0, y: 0.6 };
    }
    st.update(dt * this.timeScale, this.time, this.speed);
    // Speed lines round the wheel while it's really going (and the rush of air under the ticks).
    const sp = st.wheel.spinSpeed;
    this.sfx.whirr(this.menus.open ? 0 : sp);
    if (st.rig.station === 'center' && sp > 150 && !this.menus.open) {
      const c = this.toScreen(st.wheel.centerWorld());
      const r = this.toScreen(st.wheel.rimWorld());
      this.hud.speedLines = { x: c.x, y: c.y, r: Math.hypot(r.x - c.x, r.y - c.y), amt: Math.min(1, (sp - 150) / 700), rot: st.wheel.theta * DEG };
    } else this.hud.speedLines = null;
    this.input.pollGamepad(dt, st.post.width, st.post.height);
    this.input.flush();
    this.hud.update(dt);

    // Hover tooltip.
    const m = this.input.mouse;
    let hoverId: string | null = null;
    if (!this.target) {
      const hit = m.inside && !this.hud.choice ? st.pick(m.x, m.y) : null;
      hoverId = hit?.id ?? null;
      this.hud.tooltip = hit && !this.grab ? tooltipFor(hit, g) : null;
      // The broadcast graphics explain themselves too (new players hover everything).
      const hudTip = m.inside && !this.grab && !this.charge ? this.hud.hudTipAt(m.x, m.y, st.post.width, st.post.height, st.post.scale) : null;
      if (hudTip) this.hud.tooltip = hudTip;
    }
    this.hud.cursor = this.grab ? 'grab' : hoverId === 'wheel' && st.rig.station === 'center' && this.canGrab() ? 'open' : null;
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
