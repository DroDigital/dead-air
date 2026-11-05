/**
 * DOM menus: title, new broadcast, settings, collection (the prop room), credits, pause,
 * end-of-run summary. Fully keyboard navigable (Tab/arrows/Enter) and mouse driven.
 */
import type { Action } from './input';
import sourceManifest from '../../assets/manifest.json';
import runtimeIndex from '../assets/manifest.json';
import { ARTIFACTS, LOCKED_ARTIFACTS } from '../content/artifacts';
import { LORE } from '../content/lore';
import { STAKES, STARTING_WHEELS } from '../content/wheels';
import type { Settings } from '../core/config';
import { desktop } from '../core/desktop';
import { randomSeedString } from '../core/rng';
import { UNLOCKS, endlessUnlocked, isUnlocked, maxStake, unlockedWheels, type MetaState, type RatingsBreakdown, type Unlock } from '../game/meta';

export interface NewRunChoice {
  seed: string;
  stake: number;
  startWheel: string;
}

export interface MenuCallbacks {
  onContinue(): void;
  onNewRun(c: NewRunChoice): void;
  onResume(): void;
  onAbandon(): void;
  onQuitToTitle(): void;
  onSettings(s: Settings): void;
  onEndlessContinue(): void;
  onRetire(): void;
  onUiSound(kind: 'move' | 'select' | 'back' | 'slam'): void;
  /** A lore note was opened (the archivist reads it aloud) or closed. */
  onLoreNote?(text: string | null): void;
  /** Whether a note has a recorded reading. */
  loreVoiced?(text: string): boolean;
  getMeta(): MetaState;
  getSettings(): Settings;
  hasSave(): boolean;
  /** Icon URL; `drawnOnly` skips the rendered-prop fallback (used for silhouettes). */
  artifactIcon(id: string, drawnOnly?: boolean): string | null;
}

type Page = 'title' | 'new' | 'settings' | 'collection' | 'credits' | 'pause' | 'abandon' | 'summary' | null;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Game-over timing (keep in step with the CSS in index.html): GAME OVER lands, then the card rises. */
const GAMEOVER_TITLE_LANDS_MS = 2250;
const GAMEOVER_CARD_MS = 3100;

export class Menus {
  private root: HTMLDivElement;
  page: Page = null;
  private back: Page = null;
  private summary: { won: boolean; deadline: number; ratings: RatingsBreakdown; unlocks: Unlock[]; canEndless: boolean } | null = null;
  /** Desktop build only: whether the window is fullscreen (labels the settings toggle). */
  private fullscreen = false;

  constructor(private cb: MenuCallbacks) {
    this.root = document.createElement('div');
    this.root.id = 'menus';
    document.body.appendChild(this.root);
    this.root.addEventListener('keydown', (e) => this.keys(e));
    if (desktop) {
      const label = () => {
        const b = this.root.querySelector<HTMLButtonElement>('button[data-fs]');
        if (b) b.textContent = this.fullscreenLabel();
      };
      void desktop.isFullscreen().then((on) => {
        this.fullscreen = on;
        label();
      });
      desktop.onFullscreenChange((on) => {
        this.fullscreen = on;
        label();
      });
    }
  }

  private fullscreenLabel(): string {
    return this.fullscreen ? 'WINDOWED (F11)' : 'FULLSCREEN (F11)';
  }

  get open(): boolean {
    return this.page !== null;
  }

  show(p: Page, back: Page = null): void {
    this.page = p;
    this.back = back;
    this.render();
  }

  hide(): void {
    this.page = null;
    this.root.innerHTML = '';
    this.root.className = '';
  }

  showSummary(won: boolean, deadline: number, ratings: RatingsBreakdown, unlocks: Unlock[], canEndless: boolean): void {
    this.summary = { won, deadline, ratings, unlocks, canEndless };
    this.show('summary');
  }

  /** Route controller actions directly to native menu controls. */
  action(a: Action): void {
    const focusables = [...this.root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), details[data-lore] > summary')];
    const active = document.activeElement as HTMLElement | null;
    const i = focusables.indexOf(active as HTMLElement);
    if (a.type === 'nav') {
      const horizontal = a.dir === 'left' || a.dir === 'right';
      const step = a.dir === 'left' || a.dir === 'up' ? -1 : 1;
      if (horizontal && active instanceof HTMLInputElement && active.type === 'range') {
        if (step < 0) active.stepDown(); else active.stepUp();
        active.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (horizontal && active instanceof HTMLSelectElement) {
        let next = active.selectedIndex + step;
        while (next >= 0 && next < active.options.length && active.options[next].disabled) next += step;
        if (next >= 0 && next < active.options.length) {
          active.selectedIndex = next;
          active.dispatchEvent(new Event('input', { bubbles: true }));
          active.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        focusables[(i + step + focusables.length) % focusables.length]?.focus();
      }
      this.cb.onUiSound('move');
    } else if (a.type === 'confirm') {
      if (active instanceof HTMLButtonElement || active instanceof HTMLInputElement && active.type === 'checkbox' || active?.tagName === 'SUMMARY') active.click();
    } else if (a.type === 'back' || a.type === 'pause') {
      if (this.page === 'pause') this.cb.onResume();
      else if (this.back) this.show(this.back, this.back === 'pause' ? null : 'title');
      else return;
      this.cb.onUiSound('back');
    }
  }

  private keys(e: KeyboardEvent): void {
    const focusables = [...this.root.querySelectorAll<HTMLElement>('button:not([disabled]), input, select')];
    const i = focusables.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || (e.key === 'ArrowRight' && (document.activeElement as HTMLElement)?.tagName === 'BUTTON')) {
      e.preventDefault();
      focusables[(i + 1) % focusables.length]?.focus();
      this.cb.onUiSound('move');
    } else if (e.key === 'ArrowUp' || (e.key === 'ArrowLeft' && (document.activeElement as HTMLElement)?.tagName === 'BUTTON')) {
      e.preventDefault();
      focusables[(i - 1 + focusables.length) % focusables.length]?.focus();
      this.cb.onUiSound('move');
    } else if (e.key === 'Escape' && this.back !== undefined) {
      e.preventDefault();
      e.stopPropagation();
      this.cb.onUiSound('back');
      if (this.page === 'pause') this.cb.onResume();
      else if (this.back) this.show(this.back, this.back === 'pause' ? null : 'title');
    }
  }

  private btn(label: string, fn: () => void, attrs = ''): string {
    const id = `b${Math.random().toString(36).slice(2, 8)}`;
    queueMicrotask(() => {
      const el = document.getElementById(id);
      el?.addEventListener('click', () => {
        this.cb.onUiSound('select');
        fn();
      });
    });
    return `<button id="${id}" ${attrs}>${label}</button>`;
  }

  private render(): void {
    const p = this.page;
    this.root.className = p ? `page-${p}` : '';
    if (!p) {
      this.root.innerHTML = '';
      return;
    }
    let html = '';
    const meta = this.cb.getMeta();
    if (p === 'title') {
      html = `<div class="panel title">
        <div class="logo"><img src="assets/art/title/lettered.png" alt="DEAD AIR" onerror="this.parentElement.innerHTML='DEAD<span>AIR</span>'"></div>
        <div class="tag">a prize-wheel gambling roguelite</div>
        <div class="col">
          ${this.cb.hasSave() ? this.btn('CONTINUE BROADCAST', () => this.cb.onContinue()) : ''}
          ${this.btn('NEW BROADCAST', () => this.show('new', 'title'))}
          ${this.btn('THE PROP ROOM', () => this.show('collection', 'title'))}
          ${this.btn('SETTINGS', () => this.show('settings', 'title'))}
          ${this.btn('CREDITS', () => this.show('credits', 'title'))}
          ${desktop ? this.btn('QUIT TO DESKTOP', () => void desktop!.quit()) : ''}
        </div>
        <div class="foot">RATINGS ${meta.ratings} · BROADCASTS ${meta.runs} · PAID OFF ${meta.wins}</div>
      </div>`;
    } else if (p === 'new') {
      const wheels = unlockedWheels(meta);
      const ms = maxStake(meta);
      html = `<div class="panel">
        <h2>NEW BROADCAST</h2>
        <label>SEED <input id="seed" value="${esc(randomSeedString())}" maxlength="24"></label>
        <label>STAKE <select id="stake">${STAKES.map((s) => `<option value="${s.id}" ${s.id > ms ? 'disabled' : ''}>${esc(s.name)} — ${esc(s.text)}${s.id > ms ? ` (LOCKED: ${s.unlockAt} RATINGS)` : ''}</option>`).join('')}</select></label>
        <label>WHEEL <select id="wheel">${STARTING_WHEELS.map((w) => `<option value="${w.id}" ${wheels.includes(w.id) ? '' : 'disabled'}>${esc(w.name)}${wheels.includes(w.id) ? '' : ` (LOCKED: ${w.unlockAt} RATINGS)`}</option>`).join('')}</select></label>
        <p id="wheeldesc" class="small"></p>
        <div class="row">
          ${this.btn('GO LIVE', () => {
            const seed = (document.getElementById('seed') as HTMLInputElement).value.trim() || randomSeedString();
            const stake = Number((document.getElementById('stake') as HTMLSelectElement).value);
            const startWheel = (document.getElementById('wheel') as HTMLSelectElement).value;
            this.cb.onNewRun({ seed, stake: Math.min(stake, ms), startWheel: wheels.includes(startWheel) ? startWheel : 'standard' });
          })}
          ${this.btn('BACK', () => this.show('title'))}
        </div>
        <p class="small">ENDLESS: ${endlessUnlocked(meta) ? 'unlocked — offered after you pay Deadline 8.' : 'locked (100 Ratings).'}</p>
      </div>`;
      queueMicrotask(() => {
        const sel = document.getElementById('wheel') as HTMLSelectElement | null;
        const desc = document.getElementById('wheeldesc');
        const upd = () => {
          if (sel && desc) desc.textContent = STARTING_WHEELS.find((w) => w.id === sel.value)?.text ?? '';
        };
        sel?.addEventListener('change', upd);
        upd();
      });
    } else if (p === 'settings') {
      const s = this.cb.getSettings();
      const slider = (key: keyof Settings, label: string, max = 1, step = 0.05) =>
        `<label>${label} <input type="range" min="0" max="${max}" step="${step}" data-k="${key}" value="${s[key]}"></label>`;
      const check = (key: keyof Settings, label: string) => `<label class="chk"><input type="checkbox" data-k="${key}" ${s[key] ? 'checked' : ''}> ${label}</label>`;
      html = `<div class="panel">
        <h2>SETTINGS</h2>
        <div class="grid2">
          <label>RESOLUTION <select data-k="resolutionScale"><option value="1" ${s.resolutionScale === 1 ? 'selected' : ''}>320×180</option><option value="2" ${s.resolutionScale === 2 ? 'selected' : ''}>640×360</option></select></label>
          ${slider('warp', 'AFFINE WARP')}
          ${check('crt', 'CRT FILTER')}
          ${check('dither', 'DITHERING')}
          ${check('reducedFlashing', 'REDUCED FLASHING')}
          ${check('screenShake', 'SCREEN SHAKE')}
          ${check('fastMode', 'FAST MODE (F)')}
          ${check('colorblind', 'COLORBLIND WEDGE PATTERNS')}
          ${check('captions', 'CAPTIONS')}
          ${slider('masterVolume', 'MASTER')}
          ${slider('music', 'MUSIC')}
          ${slider('sfx', 'SFX')}
          ${slider('voice', 'VOICE')}
          ${slider('ambience', 'AMBIENCE')}
        </div>
        <div class="row">${this.btn('DONE', () => this.show(this.back ?? 'title', this.back === 'pause' ? null : 'title'))}${
          desktop ? this.btn(this.fullscreenLabel(), () => void desktop!.setFullscreen(!this.fullscreen), 'data-fs') : ''
        }</div>
        <p class="small">KEYS: ARROWS/WASD look · SPACE spins · ENTER deposit/confirm · 1-6 cards/artifacts/choices · F fast · ESC pause</p>
        <p class="small">PAD: D-PAD/LEFT STICK look · A confirm · B back/sell · X spin · Y gamble · RB fast · START pause · RIGHT STICK cursor · RT click</p>
      </div>`;
      queueMicrotask(() => {
        this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((el) => {
          el.addEventListener('input', () => {
            const cur = { ...this.cb.getSettings() } as Record<string, unknown>;
            const k = el.dataset.k!;
            if (el instanceof HTMLInputElement && el.type === 'checkbox') cur[k] = el.checked;
            else cur[k] = Number(el.value);
            this.cb.onSettings(cur as unknown as Settings);
          });
        });
      });
    } else if (p === 'collection') {
      const seen = new Set(meta.seenArtifacts);
      const cards = ARTIFACTS.map((a) => {
        const locked = LOCKED_ARTIFACTS.includes(a.id) && !isUnlocked(meta, `artifact:${a.id}`);
        const known = seen.has(a.id);
        // Unseen props show as a silhouette when the drawn icon exists.
        const icon = known || !locked ? this.cb.artifactIcon(a.id, !known) : null;
        return `<div class="prop ${known ? 'known' : ''} ${locked ? 'locked' : ''} r-${a.rarity}">
          <div class="icon">${icon ? `<img src="${icon}" alt=""${known ? '' : ' class="unseen"'}>` : locked ? 'LOCK' : '?'}</div>
          <div class="pn">${known ? esc(a.name) : locked ? 'LOCKED' : '???'}</div>
          <div class="pt">${known ? esc(a.text) : locked ? `Unlocks at ${UNLOCKS.find((u) => u.id === `artifact:${a.id}`)?.at ?? '?'} Ratings` : 'Not yet found.'}</div>
        </div>`;
      }).join('');
      const lore = LORE.map((n) => {
        const un = n.unlocked(meta);
        const voiced = un && this.cb.loreVoiced?.(n.text);
        return `<details class="note ${un ? '' : 'locked'}" ${un ? `data-lore="${LORE.indexOf(n)}"` : 'disabled'}><summary>${un ? esc(n.title) : '— TORN NOTE —'}${voiced ? ' <span class="reel">◉ REEL</span>' : ''}</summary><p>${un ? esc(n.text) : esc(n.hint)}</p></details>`;
      }).join('');
      const unl = UNLOCKS.map((u) => `<li class="${isUnlocked(meta, u.id) ? 'on' : ''}">${u.at} — ${esc(u.kind.toUpperCase())}: ${esc(u.name)}</li>`).join('');
      html = `<div class="panel wide proproom">
        <h2>THE PROP ROOM</h2>
        <p class="small">Dust. Sheets over shapes. ${seen.size}/${ARTIFACTS.length} artifacts catalogued · ${LORE.filter((n) => n.unlocked(meta)).length}/${LORE.length} notes · lifetime ratings ${meta.totalRatings}</p>
        <div class="props">${cards}</div>
        <h3>NOTES FOUND IN THE STUDIO</h3>
        <div class="notes">${lore}</div>
        <h3>UNLOCKS</h3>
        <ul class="unlocks">${unl}</ul>
        <div class="row">${this.btn('BACK', () => this.show('title'))}</div>
      </div>`;
    } else if (p === 'credits') {
      const idx = (runtimeIndex as { assets: Record<string, unknown> }).assets;
      const rows = (sourceManifest as { assets: { id: string; sourceUrl: string; author: string; license: string; modifications: string }[] }).assets
        .map((a) => `<tr><td>${esc(a.id)}</td><td>${idx[a.id] ? esc(a.author) : '<i>procedural stand-in</i>'}</td><td>${esc(a.license)}</td><td>${idx[a.id] ? esc(a.sourceUrl) : '—'}</td></tr>`)
        .join('');
      html = `<div class="panel wide">
        <h2>CREDITS</h2>
        <p>DEAD AIR — design, code, writing, procedural art, sound and music made for this project.</p>
        <table class="credits"><tr><th>ASSET</th><th>AUTHOR</th><th>LICENCE</th><th>SOURCE</th></tr>${rows}</table>
        <p class="small">Libraries: three.js (MIT), GSAP. Fonts: Silkscreen (Jason Kottke, OFL), VT323 (Peter Hull, OFL). Full list in CREDITS.md.</p>
        <div class="row">${this.btn('BACK', () => this.show('title'))}</div>
      </div>`;
    } else if (p === 'pause') {
      html = `<div class="panel">
        <h2>STAND BY</h2>
        <div class="col">
          ${this.btn('RESUME', () => this.cb.onResume())}
          ${this.btn('SETTINGS', () => this.show('settings', 'pause'))}
          ${this.btn('QUIT TO TITLE (SAVED)', () => this.cb.onQuitToTitle())}
          ${this.btn('ABANDON BROADCAST', () => this.show('abandon', 'pause'))}
        </div>
      </div>`;
    } else if (p === 'abandon') {
      html = `<div class="panel">
        <h2>ABANDON BROADCAST?</h2>
        <p>The run ends and counts as a loss.</p>
        <div class="col">
          ${this.btn('KEEP BROADCASTING', () => this.show('pause'))}
          ${this.btn('ABANDON BROADCAST', () => this.cb.onAbandon())}
        </div>
      </div>`;
    } else if (p === 'summary' && this.summary) {
      const s = this.summary;
      this.root.classList.add(s.won ? 'won' : 'lost');
      if (!s.won && this.cb.getSettings().reducedFlashing) this.root.classList.add('reduced-flashing');
      // Lost: the trapdoor scene plays (the host's glove waving from below), GAME OVER drops in,
      // then the run's card rises. The CSS times it; the slam is timed to match.
      if (!s.won) {
        const page = this.page;
        setTimeout(() => this.page === page && this.summary === s && this.cb.onUiSound('slam'), GAMEOVER_TITLE_LANDS_MS);
      }
      html = `${s.won ? '' : '<div class="gostage" aria-hidden="true"><div class="gowave"></div><div class="golight"></div></div><div class="gotitle-wrap"><div class="gotitle"><span class="back">GAME OVER</span><span class="front">GAME OVER</span></div></div>'}<div class="panel">
        <h2 class="${s.won ? 'win' : 'lose'}">${s.won ? 'PAID IN FULL' : "THAT'S OUR SHOW"}</h2>
        <p>${s.won ? 'All eight Deadlines paid. The Network is… pleased.' : `The floor opened at Deadline ${s.deadline}.`}</p>
        <table class="ratings">${s.ratings.lines.map((l) => `<tr><td>${esc(l.label)}</td><td>+${l.value}</td></tr>`).join('')}<tr class="tot"><td>RATINGS</td><td>${s.ratings.total}</td></tr></table>
        ${s.unlocks.length ? `<h3>NEW IN THE PROP ROOM</h3><ul>${s.unlocks.map((u) => `<li>${esc(u.kind.toUpperCase())}: ${esc(u.name)}</li>`).join('')}</ul>` : ''}
        <div class="col">
          ${s.won && s.canEndless ? this.btn('KEEP BROADCASTING (ENDLESS)', () => this.cb.onEndlessContinue()) : ''}
          ${s.won ? this.btn('RETIRE A WINNER', () => this.cb.onRetire()) : this.btn('BACK TO TITLE', () => this.cb.onQuitToTitle())}
        </div>
      </div>`;
    }
    this.cb.onLoreNote?.(null);
    this.root.innerHTML = html;
    this.root.querySelectorAll<HTMLDetailsElement>('details[data-lore]').forEach((d) =>
      d.addEventListener('toggle', () => {
        if (d.open) this.root.querySelectorAll<HTMLDetailsElement>('details[data-lore]').forEach((o) => o !== d && (o.open = false));
        this.cb.onLoreNote?.(d.open ? LORE[Number(d.dataset.lore)].text : null);
      }),
    );
    // On the game-over screen the buttons only take focus once the card has risen; a click skips
    // straight to the card.
    const gameOver = p === 'summary' && !!this.summary && !this.summary.won;
    const focusFirst = () => this.root.querySelector<HTMLElement>('button, input, select')?.focus();
    setTimeout(focusFirst, gameOver ? GAMEOVER_CARD_MS : 0);
    if (gameOver)
      this.root.addEventListener(
        'pointerdown',
        () => {
          if (this.root.classList.contains('goskip')) return;
          this.root.classList.add('goskip');
          setTimeout(focusFirst, 50);
        },
        { once: true },
      );
  }
}
