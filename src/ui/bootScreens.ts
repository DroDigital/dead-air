/**
 * The boot overlay: the VHS loading banner (scrubbed to the real loading progress), a press-to-start
 * prompt, and the intro cutscene with its soundtrack. Both videos carry their VHS treatment from
 * tools/video.ts; the timing lives in bootTimeline.ts.
 */
import { INTRO_PUSH, cameraAt, followProgress, loadingTime } from './bootTimeline';

const LOADING_URL = 'assets/video/loading-banner.mp4';
const INTRO_URL = 'assets/video/intro-cutscene.mp4';
/** The loader stays up at least this long, so a fast load still shows the banner through. */
const MIN_LOADER_MS = 2600;
/** The intro can be skipped once it has played this long, so the press that started it cannot skip it. */
const SKIP_AFTER_MS = 1000;
const FADE_MS = 450;

type Phase = 'loading' | 'prompt' | 'intro' | 'closed';

export class BootScreens {
  private readonly root = document.createElement('div');
  private readonly loader = document.createElement('video');
  private readonly intro = document.createElement('video');
  private readonly prompt = document.createElement('div');
  private phase: Phase = 'loading';
  private real = 0;
  private shown = 0;
  /** False where the platform cannot seek the banner: it then plays through at its own pace. */
  private scrub = true;
  /** When the shown progress reached its end (ms), or -1 while it is still climbing. */
  private doneAt = -1;
  private born = performance.now();
  private last = this.born;
  private skipPrompt = false;
  /** Set by whenReady(): the prompt only appears while the boot is waiting on it. */
  private ready: (() => void) | null = null;
  private ended: (() => void) | null = null;
  private introAt = 0;
  private introBroken = false;
  private readonly onPress = (): void => this.press();

  constructor(private readonly volume: () => number) {
    this.root.id = 'boot';
    this.loader.id = 'boot-loader';
    this.loader.className = 'boot-video';
    this.loader.muted = true;
    this.loader.playsInline = true;
    this.loader.preload = 'auto';
    this.loader.src = LOADING_URL;
    this.intro.id = 'boot-intro';
    this.intro.className = 'boot-video';
    this.intro.playsInline = true;
    this.intro.preload = 'auto';
    this.intro.src = INTRO_URL;
    this.intro.style.transformOrigin = `${INTRO_PUSH.origin[0] * 100}% ${INTRO_PUSH.origin[1] * 100}%`;
    this.intro.style.display = 'none';
    this.prompt.className = 'boot-prompt';
    this.prompt.textContent = 'PRESS ANY KEY';
    this.prompt.hidden = true;
    this.root.append(this.loader, this.intro, this.prompt);
    document.body.appendChild(this.root);
    this.loader.addEventListener('loadedmetadata', () => {
      if (this.loader.seekable.length > 0) this.loader.currentTime = loadingTime(0);
      else {
        this.scrub = false;
        void this.loader.play().catch(() => { /* A still frame is fine. */ });
      }
    });
    this.loader.addEventListener('error', () => {
      this.scrub = false;
    });
    this.intro.addEventListener('error', () => {
      this.introBroken = true;
      this.endIntro();
    });
    requestAnimationFrame(this.tick);
  }

  /** The real loading progress, 0 to 1. */
  progress(p: number): void {
    this.real = Math.min(1, Math.max(0, p));
  }

  /**
   * Resolves once the banner has run through and, unless `skipPrompt`, a key or click has been pressed.
   * Call playIntro() from the continuation, so the press counts as the gesture that lets the intro sound.
   */
  whenReady(skipPrompt: boolean): Promise<void> {
    this.skipPrompt = skipPrompt;
    return new Promise<void>((resolve) => {
      this.ready = resolve;
    });
  }

  /** Plays the intro with its soundtrack. Resolves when it ends, is skipped, or cannot play. */
  playIntro(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.ended = resolve;
      this.dropPressListeners();
      this.phase = 'intro';
      this.loader.style.display = 'none';
      this.prompt.hidden = true;
      this.intro.style.display = 'block';
      this.intro.volume = Math.min(1, Math.max(0, this.volume()));
      this.intro.currentTime = 0;
      this.intro.onended = () => this.endIntro();
      this.introAt = performance.now();
      window.addEventListener('keydown', this.onPress);
      window.addEventListener('pointerdown', this.onPress);
      if (this.introBroken) {
        this.endIntro();
        return;
      }
      this.intro.play().catch(() => this.endIntro());
    });
  }

  /** A key, click or pad button: starts the intro from the prompt, and skips the intro once it has had a moment. */
  press(): void {
    if (this.phase === 'prompt' && this.ready) {
      this.dropPressListeners();
      this.prompt.hidden = true;
      this.finishReady();
    } else if (this.phase === 'intro' && performance.now() - this.introAt > SKIP_AFTER_MS) {
      this.endIntro();
    }
  }

  /** Fades the overlay out and removes it. Safe to call more than once. */
  close(): void {
    if (this.phase === 'closed') return;
    this.phase = 'closed';
    this.dropPressListeners();
    this.loader.pause();
    this.intro.pause();
    this.root.classList.add('out');
    window.setTimeout(() => this.root.remove(), FADE_MS + 50);
  }

  private readonly tick = (now: number): void => {
    if (this.phase === 'closed') return;
    const dt = (now - this.last) / 1000;
    this.last = now;
    if (this.phase === 'loading' || this.phase === 'prompt') {
      // A dropped frame must not teleport the bar: at most a quarter second of climb per frame.
      this.shown = followProgress(this.shown, this.real, Math.min(dt, 0.25));
      const at = loadingTime(this.shown);
      if (this.scrub && this.loader.readyState >= HTMLMediaElement.HAVE_METADATA && !this.loader.seeking && Math.abs(this.loader.currentTime - at) > 0.02) {
        this.loader.currentTime = at;
      }
      if (this.shown >= 0.999 && this.doneAt < 0) this.doneAt = now;
      if (this.phase === 'loading' && this.ready && this.doneAt >= 0 && (this.skipPrompt || now - this.born >= MIN_LOADER_MS) && this.landed(now)) {
        this.showPrompt();
      }
    } else if (this.phase === 'intro') {
      const cam = cameraAt(this.intro.currentTime);
      this.intro.style.transform = cam.scale > 1 ? `scale(${cam.scale.toFixed(4)})` : '';
      this.intro.style.filter = cam.blur > 0 ? `blur(${cam.blur.toFixed(2)}px)` : '';
    }
    requestAnimationFrame(this.tick);
  };

  /** The banner's last frame is on screen. Where it cannot be scrubbed, or will not land, the wait is cut short. */
  private landed(now: number): boolean {
    if (!this.scrub) return true;
    if (!this.loader.seeking && Math.abs(this.loader.currentTime - loadingTime(1)) < 0.05) return true;
    return now - this.doneAt > 1500;
  }

  private showPrompt(): void {
    this.phase = 'prompt';
    if (this.skipPrompt) {
      this.finishReady();
      return;
    }
    this.prompt.hidden = false;
    window.addEventListener('keydown', this.onPress);
    window.addEventListener('pointerdown', this.onPress);
  }

  private finishReady(): void {
    const go = this.ready;
    this.ready = null;
    go?.();
  }

  private endIntro(): void {
    if (this.phase !== 'intro') return;
    this.intro.pause();
    this.intro.onended = null;
    this.intro.style.transform = '';
    this.intro.style.filter = '';
    this.dropPressListeners();
    const done = this.ended;
    this.ended = null;
    this.close();
    done?.();
  }

  private dropPressListeners(): void {
    window.removeEventListener('keydown', this.onPress);
    window.removeEventListener('pointerdown', this.onPress);
  }
}
