/**
 * Internal-resolution overlay drawn in the pixel font: broadcast chyrons (the show's own
 * on-air graphics), captions, choice cards, hover tooltips, nav arrows, loading screen.
 */
import { drawText, LINE_H, textWidth, wrapText } from './bitfont';

export interface ChoiceOption {
  label: string;
  detail?: string;
  disabled?: boolean;
  color?: string;
}

export interface ChoicePanel {
  title: string;
  lines?: string[];
  options: ChoiceOption[];
  selected: number;
  footer?: string;
  accent?: string;
  /** Layout: 'cards' (side by side) or 'list'. */
  layout?: 'cards' | 'list';
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Caption {
  speaker: string;
  text: string;
  color: string;
  t: number;
  life: number;
}

export class Hud {
  choice: ChoicePanel | null = null;
  private optionRects: Rect[] = [];
  private arrowRects: { dir: 'up' | 'down' | 'left' | 'right'; r: Rect }[] = [];
  captions: Caption[] = [];
  toasts: { text: string; color: string; t: number }[] = [];
  tooltip: string | null = null;
  ticker = '';
  tickerRight = '';
  /** Structured chyron (preferred over the plain ticker string when set). */
  chyron: { deadline: string; spins: number; spinsMax: number; tray: number; streak: number; vault: number; debt: number } | null = null;
  /** Displayed (rolling) values and flash timers for the chyron numbers. */
  private roll = { tray: 0, vault: 0, trayFlash: 0, vaultFlash: 0, trayUp: true };
  /** 0..1 danger level (last spin short of the Debt): reddens the chyron. */
  danger = 0;
  /** The Sponsor's Challenge line (top left). */
  challenge: { name: string; text: string; prog: string; done: boolean } | null = null;
  arrows: ('up' | 'down' | 'left' | 'right')[] = [];
  banner: { text: string; sub: string; color: string; t: number; life: number } | null = null;
  fastMode = false;
  showCursor = true;
  hint = '';
  corner = '';
  /** The payout breakdown line (broadcast graphic), e.g. "$100 → ×2 → ×1.75 = $350". */
  payout: { text: string; color: string } | null = null;
  private lastPayout: { text: string; color: string } | null = null;
  private payoutAge = 0;

  caption(speaker: string, text: string, color: string, seconds: number): void {
    this.captions = [{ speaker, text, color, t: 0, life: Math.max(2, seconds + 1.2) }];
  }

  toast(text: string, color = '#ffe080'): void {
    this.toasts.push({ text, color, t: 0 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  showBanner(text: string, sub: string, color = '#ffd040', life = 2.4): void {
    this.banner = { text, sub, color, t: 0, life };
  }

  update(dt: number): void {
    const c = this.chyron;
    if (c) {
      const r = this.roll;
      const ease = (cur: number, to: number) => (Math.abs(to - cur) < 1 ? to : cur + (to - cur) * Math.min(1, dt * 7));
      if (Math.round(r.tray) !== c.tray && r.trayFlash <= 0) {
        r.trayFlash = 0.6;
        r.trayUp = c.tray > r.tray;
      }
      if (Math.round(r.vault) !== c.vault && r.vaultFlash <= 0) r.vaultFlash = 0.6;
      r.tray = ease(r.tray, c.tray);
      r.vault = ease(r.vault, c.vault);
      r.trayFlash = Math.max(0, r.trayFlash - dt);
      r.vaultFlash = Math.max(0, r.vaultFlash - dt);
    }
    if (this.payout !== this.lastPayout) {
      this.lastPayout = this.payout;
      this.payoutAge = 0;
    } else if (this.payout) {
      this.payoutAge += dt;
      if (this.payoutAge > 5) this.payout = null;
    }
    for (const c of this.captions) c.t += dt;
    this.captions = this.captions.filter((c) => c.t < c.life);
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < 2.2);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.life) this.banner = null;
    }
  }

  hitChoice(x: number, y: number): number {
    for (let i = 0; i < this.optionRects.length; i++) {
      const r = this.optionRects[i];
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
    }
    return -1;
  }

  hitArrow(x: number, y: number): 'up' | 'down' | 'left' | 'right' | null {
    for (const a of this.arrowRects) if (x >= a.r.x && x < a.r.x + a.r.w && y >= a.r.y && y < a.r.y + a.r.h) return a.dir;
    return null;
  }

  /** Segmented broadcast chyron: LIVE, Deadline, spin pips, Tray x Streak, Vault vs Debt. */
  private drawChyron(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, time: number): void {
    const c = this.chyron!;
    const r = this.roll;
    const H = 12 * k;
    const y = h - H;
    const d = this.danger;
    const red = Math.round(30 + 40 * d * (0.6 + 0.4 * Math.sin(time * 6)));
    ctx.fillStyle = d > 0 ? 'rgba(' + red + ',4,2,0.88)' : 'rgba(10,4,2,0.86)';
    ctx.fillRect(0, y, w, H);
    ctx.fillStyle = '#ffb040';
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, y, w, k);
    ctx.globalAlpha = 1;
    let x = 0;
    const seg = (sw: number, bg: string | null) => {
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(x, y + k, sw, H - k);
      }
      const x0 = x;
      x += sw;
      ctx.fillStyle = 'rgba(255,176,64,0.25)';
      ctx.fillRect(x - k, y + 2 * k, k, H - 3 * k);
      return x0;
    };
    // LIVE with a tally dot.
    let x0 = seg(30 * k, '#a81c10');
    const on = Math.floor(time * 1.5) % 2 === 0;
    ctx.fillStyle = on ? '#ffffff' : '#ff8070';
    ctx.fillRect(x0 + 3 * k, y + 5 * k, 3 * k, 3 * k);
    drawText(ctx, 'LIVE', x0 + 18 * k, y + 3 * k, { align: 'center', scale: k, color: '#ffffff' });
    // Deadline.
    const dl = 'D' + c.deadline;
    x0 = seg((textWidth(dl) + 8) * k, null);
    drawText(ctx, dl, x0 + 4 * k, y + 3 * k, { scale: k, color: '#ffd040' });
    // Spins as pips.
    const pips = Math.min(14, Math.max(c.spinsMax, c.spins));
    const pl = textWidth('SPINS') + 6;
    x0 = seg((pips * 4 + pl + 3) * k, null);
    drawText(ctx, 'SPINS', x0 + 3 * k, y + 3 * k, { scale: k, color: '#a08060' });
    for (let i = 0; i < pips; i++) {
      const left = i < c.spins;
      const last = left && c.spins === 1;
      ctx.fillStyle = left ? (last && Math.floor(time * 4) % 2 ? '#ff4030' : '#ffd040') : '#3a2414';
      ctx.fillRect(x0 + (pl + i * 4) * k, y + 4 * k, 3 * k, 5 * k);
    }
    // Tray x Streak: the number rolls; the streak heats from pale to red.
    const tray = 'TRAY $' + Math.round(r.tray);
    const st = '\u00d7' + c.streak.toFixed(2);
    x0 = seg((textWidth(tray) + textWidth(st) + 14) * k, null);
    const tf = r.trayFlash > 0 && Math.floor(r.trayFlash * 10) % 2 === 0;
    drawText(ctx, tray, x0 + 4 * k, y + 3 * k, { scale: k, color: tf ? (r.trayUp ? '#a0ffa0' : '#ff6050') : '#f0e0b0' });
    const heat = Math.min(1, (c.streak - 1) / 2);
    const sc = heat <= 0 ? '#c0b090' : heat < 0.5 ? '#ffd060' : heat < 0.85 ? '#ff9030' : Math.floor(time * 6) % 2 ? '#ff4020' : '#ffd060';
    drawText(ctx, st, x0 + (8 + textWidth(tray)) * k, y + 3 * k, { scale: k, color: sc });
    // Vault vs Debt with a progress bar; the Tray shows as a ghost on top.
    const vt = 'VAULT $' + Math.round(r.vault) + '/' + c.debt;
    const vw = Math.max(textWidth(vt) + 8, w / k - x / k - 2);
    x0 = seg(vw * k, null);
    const vf = r.vaultFlash > 0 && Math.floor(r.vaultFlash * 10) % 2 === 0;
    const covered = r.vault >= c.debt;
    drawText(ctx, vt, x0 + 4 * k, y + 3 * k, { scale: k, color: vf ? '#ffffff' : covered ? '#90ff90' : '#f0e0b0' });
    const frac = Math.max(0, Math.min(1, r.vault / Math.max(1, c.debt)));
    const bx = x0 + 4 * k;
    const bw = (vw - 8) * k;
    ctx.fillStyle = '#2a1a10';
    ctx.fillRect(bx, y + 10 * k, bw, k);
    ctx.fillStyle = covered ? '#60ff60' : frac > 0.66 ? '#ffd040' : '#ff7040';
    ctx.fillRect(bx, y + 10 * k, Math.round(bw * frac), k);
    const ghost = Math.max(0, Math.min(1, (r.vault + r.tray) / Math.max(1, c.debt))) - frac;
    if (ghost > 0) {
      ctx.fillStyle = 'rgba(160,255,160,0.45)';
      ctx.fillRect(bx + Math.round(bw * frac), y + 10 * k, Math.round(bw * ghost), k);
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, mouse: { x: number; y: number; inside: boolean }, time: number): void {
    // ---- Nav arrows (mouse play) ----
    this.arrowRects = [];
    if (!this.choice) {
      const blink = Math.floor(time * 2) % 2 === 0;
      for (const dir of this.arrows) {
        const r: Rect =
          dir === 'left'
            ? { x: 2 * k, y: h / 2 - 10 * k, w: 10 * k, h: 20 * k }
            : dir === 'right'
              ? { x: w - 12 * k, y: h / 2 - 10 * k, w: 10 * k, h: 20 * k }
              : dir === 'up'
                ? { x: w / 2 - 10 * k, y: 2 * k, w: 20 * k, h: 10 * k }
                : { x: w / 2 - 10 * k, y: h - 24 * k, w: 20 * k, h: 10 * k };
        this.arrowRects.push({ dir, r });
        const hover = mouse.inside && mouse.x >= r.x && mouse.x < r.x + r.w && mouse.y >= r.y && mouse.y < r.y + r.h;
        const glyph = { left: '←', right: '→', up: '↑', down: '↓' }[dir];
        if (hover || blink) drawText(ctx, glyph, r.x + r.w / 2, r.y + r.h / 2 - 3.5 * k, { align: 'center', scale: k, color: hover ? '#ffffff' : 'rgba(255,224,128,0.55)', shadow: '#000' });
      }
    }

    // ---- Bottom chyron (broadcast ticker) ----
    if (this.chyron) this.drawChyron(ctx, w, h, k, time);
    else if (this.ticker) {
      const y = h - 11 * k;
      ctx.fillStyle = 'rgba(10,4,2,0.82)';
      ctx.fillRect(0, y, w, 11 * k);
      ctx.fillStyle = '#c02818';
      ctx.fillRect(0, y, 30 * k, 11 * k);
      drawText(ctx, 'LIVE', 15 * k, y + 2 * k, { align: 'center', scale: k, color: Math.floor(time * 1.5) % 2 ? '#ffffff' : '#ffd0c0' });
      drawText(ctx, this.ticker, 34 * k, y + 2 * k, { scale: k, color: '#f0e0b0' });
      if (this.tickerRight) drawText(ctx, this.tickerRight, w - 3 * k, y + 2 * k, { align: 'right', scale: k, color: '#a0e0a0' });
    }
    if (this.hint && !this.choice) drawText(ctx, this.hint, w / 2, h - (this.chyron ? 23 : 21) * k, { align: 'center', scale: k, color: 'rgba(255,240,200,0.8)', shadow: '#000' });

    // ---- Banner (Deadline intro, SWEEPS, combos) ----
    if (this.banner) {
      const b = this.banner;
      const slide = Math.min(1, b.t * 5) * (b.t > b.life - 0.25 ? (b.life - b.t) / 0.25 : 1);
      const bw = w * slide;
      const y = h * 0.3;
      ctx.fillStyle = 'rgba(20,6,2,0.92)';
      ctx.fillRect(w / 2 - bw / 2, y, bw, 26 * k);
      // Broadcast-graphics stripes scrolling behind the title.
      ctx.save();
      ctx.beginPath();
      ctx.rect(w / 2 - bw / 2, y + k, bw, 24 * k);
      ctx.clip();
      ctx.fillStyle = b.color;
      ctx.globalAlpha = 0.09;
      const off = (b.t * 40 * k) % (12 * k);
      for (let x = -26 * k; x < w + 26 * k; x += 12 * k) {
        ctx.beginPath();
        ctx.moveTo(x + off, y + 26 * k);
        ctx.lineTo(x + off + 6 * k, y + 26 * k);
        ctx.lineTo(x + off + 30 * k, y);
        ctx.lineTo(x + off + 24 * k, y);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = b.color;
      ctx.fillRect(w / 2 - bw / 2, y, bw, k);
      ctx.fillRect(w / 2 - bw / 2, y + 26 * k - k, bw, k);
      // A light sweep across the bar as it lands.
      if (b.t < 0.6) {
        const sx = w / 2 - bw / 2 + (b.t / 0.6) * bw;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(sx - 6 * k, y, 6 * k, 26 * k);
      }
      if (slide > 0.9) {
        const pop = b.t < 0.32 ? -Math.round(Math.sin((b.t / 0.32) * Math.PI) * 2) * k : 0;
        drawText(ctx, b.text, w / 2, y + 4 * k + pop, { align: 'center', scale: 2 * k, color: b.color, shadow: '#000' });
        drawText(ctx, b.sub, w / 2, y + 18 * k, { align: 'center', scale: k, color: '#f0e0c0' });
      }
    }

    // ---- Payout line ----
    if (this.payout && !this.choice) {
      const lines = wrapText(this.payout.text, 50);
      const y0 = 3 * k;
      ctx.fillStyle = 'rgba(10,4,2,0.8)';
      ctx.fillRect(0, y0, w, (lines.length * LINE_H + 3) * k);
      lines.forEach((l, i) => drawText(ctx, l, w / 2, y0 + (2 + i * LINE_H) * k, { align: 'center', scale: k, color: this.payout!.color }));
    }

    // ---- Toasts ----
    this.toasts.forEach((t, i) => {
      const y = (this.payout ? 26 : 14) * k + i * 10 * k - Math.min(1, t.t) * 2 * k;
      if (t.t > 1.8 && Math.floor(t.t * 10) % 2) return;
      drawText(ctx, t.text, w / 2, y, { align: 'center', scale: k, color: t.color, shadow: '#000' });
    });

    // ---- Captions ----
    const cap = this.captions[0];
    if (cap && !this.choice) {
      const lines = wrapText(cap.text, 46);
      const shown = Math.ceil(cap.t * 40);
      let left = shown;
      const by = h - (this.ticker ? 14 : 4) * k - lines.length * LINE_H * k - 9 * k;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(14 * k, by - 2 * k, w - 28 * k, (lines.length * LINE_H + 12) * k);
      drawText(ctx, cap.speaker, 18 * k, by, { scale: k, color: cap.color });
      lines.forEach((l, i) => {
        const vis = l.slice(0, Math.max(0, left));
        left -= l.length;
        drawText(ctx, vis, 18 * k, by + (10 + i * LINE_H) * k, { scale: k, color: '#ffffff' });
      });
    }

    // ---- Choice panel ----
    this.optionRects = [];
    if (this.choice) this.drawChoice(ctx, w, h, k, mouse);

    // ---- Tooltip ----
    if (this.tooltip && mouse.inside && !this.choice) {
      const lines = this.tooltip.split('\n').flatMap((l) => wrapText(l, 34));
      const tw = Math.max(...lines.map((l) => textWidth(l, k))) + 6 * k;
      const th = lines.length * LINE_H * k + 4 * k;
      let x = mouse.x + 8 * k,
        y = mouse.y + 8 * k;
      if (x + tw > w) x = mouse.x - tw - 4 * k;
      if (y + th > h - 12 * k) y = mouse.y - th - 4 * k;
      ctx.fillStyle = 'rgba(12,8,4,0.92)';
      ctx.fillRect(x, y, tw, th);
      ctx.fillStyle = '#c89830';
      ctx.fillRect(x, y, tw, k);
      lines.forEach((l, i) => drawText(ctx, l, x + 3 * k, y + 3 * k + i * LINE_H * k, { scale: k, color: i === 0 ? '#ffd870' : '#e8e0d0' }));
    }

    if (this.challenge && !this.choice) {
      const c = this.challenge;
      const y0 = (this.payout ? 26 : 3) * k;
      drawText(ctx, `SPONSOR: ${c.name}`, 3 * k, y0, { scale: k, color: c.done ? '#80ff80' : '#ffc040', shadow: '#000' });
      drawText(ctx, c.done ? 'DONE' : `${c.text} ${c.prog}`, 3 * k, y0 + 9 * k, { scale: k, color: c.done ? '#60c060' : 'rgba(255,230,180,0.8)', shadow: '#000' });
    }
    if (this.corner && !this.choice) drawText(ctx, this.corner, w - 3 * k, (this.payout ? 26 : 3) * k, { align: 'right', scale: k, color: '#ffc040', shadow: '#000' });
    if (this.fastMode && !this.choice) drawText(ctx, 'FAST >>', 3 * k, (this.payout ? 26 : 3) * k, { scale: k, color: '#80ff80', shadow: '#000' });

    // ---- Cursor ----
    if (this.showCursor && mouse.inside) {
      ctx.fillStyle = '#000';
      ctx.fillRect(mouse.x - k, mouse.y - k, 3 * k, 3 * k);
      ctx.fillStyle = '#fff';
      ctx.fillRect(mouse.x, mouse.y, k, k);
    }
  }

  private drawChoice(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, mouse: { x: number; y: number; inside: boolean }): void {
    const c = this.choice!;
    const accent = c.accent ?? '#ffd040';
    const layout = c.layout ?? (c.options.length <= 3 && c.options.every((o) => (o.detail ?? '').length < 200) ? 'cards' : 'list');
    const lines = (c.lines ?? []).flatMap((l) => wrapText(l, 48));
    const pad = 6 * k;
    ctx.fillStyle = 'rgba(8,4,2,0.94)';
    const top = 10 * k;
    const panelH = h - 24 * k;
    ctx.fillRect(8 * k, top, w - 16 * k, panelH);
    ctx.fillStyle = accent;
    ctx.fillRect(8 * k, top, w - 16 * k, k);
    drawText(ctx, c.title, w / 2, top + 4 * k, { align: 'center', scale: k, color: accent, shadow: '#000' });
    let y = top + 15 * k;
    for (const l of lines) {
      drawText(ctx, l, w / 2, y, { align: 'center', scale: k, color: '#e8dcc0' });
      y += LINE_H * k;
    }
    y += 3 * k;
    const n = c.options.length;
    const hoverIdx = mouse.inside ? this.hitChoiceAt(mouse.x, mouse.y) : -1;
    if (layout === 'cards') {
      const cw = Math.floor((w - 16 * k - pad * (n + 1)) / n);
      const ch = top + panelH - y - (c.footer ? 12 : 4) * k;
      for (let i = 0; i < n; i++) {
        const o = c.options[i];
        const x = 8 * k + pad + i * (cw + pad);
        const r = { x, y, w: cw, h: ch };
        this.optionRects.push(r);
        const sel = i === c.selected || i === hoverIdx;
        ctx.fillStyle = o.disabled ? '#1a1410' : sel ? '#3a2410' : '#20160c';
        ctx.fillRect(x, y, cw, ch);
        ctx.fillStyle = sel ? accent : '#5a4020';
        ctx.fillRect(x, y, cw, k);
        ctx.fillRect(x, y + ch - k, cw, k);
        drawText(ctx, `${i + 1}`, x + 3 * k, y + 3 * k, { scale: k, color: '#806040' });
        const labLines = wrapText(o.label, Math.floor(cw / (6 * k)) - 1);
        labLines.forEach((l, j) => drawText(ctx, l, x + cw / 2, y + (7 + j * LINE_H) * k, { align: 'center', scale: k, color: o.disabled ? '#605040' : (o.color ?? '#ffffff') }));
        const det = wrapText(o.detail ?? '', Math.floor(cw / (6 * k)) - 1);
        const room = Math.max(0, Math.floor((ch / k - 7 - labLines.length * LINE_H - 2) / LINE_H));
        const detShown = det.slice(0, room);
        if (det.length > room && room > 0) detShown[room - 1] = detShown[room - 1].replace(/.$/, '') + '…';
        detShown.forEach((l, j) => drawText(ctx, l, x + 3 * k, y + (7 + (labLines.length + j) * LINE_H) * k, { scale: k, color: o.disabled ? '#504030' : '#c8bca0' }));
      }
    } else {
      const rowH = 11 * k;
      for (let i = 0; i < n; i++) {
        const o = c.options[i];
        const r = { x: 14 * k, y, w: w - 28 * k, h: rowH - k };
        this.optionRects.push(r);
        const sel = i === c.selected || i === hoverIdx;
        ctx.fillStyle = sel ? '#3a2410' : '#1a120a';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        drawText(ctx, `${i + 1} ${o.label}`, r.x + 3 * k, r.y + 2 * k, { scale: k, color: o.disabled ? '#605040' : (o.color ?? '#ffffff') });
        if (o.detail) drawText(ctx, o.detail, r.x + r.w - 3 * k, r.y + 2 * k, { align: 'right', scale: k, color: '#c8bca0' });
        y += rowH;
      }
    }
    if (c.footer) drawText(ctx, c.footer, w / 2, top + panelH - 9 * k, { align: 'center', scale: k, color: '#a09070' });
  }

  private hitChoiceAt(x: number, y: number): number {
    for (let i = 0; i < this.optionRects.length; i++) {
      const r = this.optionRects[i];
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
    }
    return -1;
  }

  /** Diegetic loading: a row of studio lights powering on one by one. */
  drawLoading(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, progress: number, time: number): void {
    ctx.fillStyle = '#060302';
    ctx.fillRect(0, 0, w, h);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const on = progress >= (i + 1) / n;
      const flick = on && Math.random() < 0.04 ? 0.4 : 1;
      const x = w * (0.12 + (0.76 * i) / (n - 1));
      const y = h * 0.28;
      // Light can.
      ctx.fillStyle = '#1a1410';
      ctx.fillRect(x - 6 * k, y - 10 * k, 12 * k, 10 * k);
      ctx.fillStyle = on ? `rgba(255,${220 * flick},${140 * flick},1)` : '#2a2018';
      ctx.fillRect(x - 5 * k, y, 10 * k, 3 * k);
      if (on) {
        ctx.fillStyle = `rgba(255,220,150,${0.06 * flick})`;
        ctx.beginPath();
        ctx.moveTo(x - 5 * k, y + 3 * k);
        ctx.lineTo(x + 5 * k, y + 3 * k);
        ctx.lineTo(x + 18 * k, h * 0.8);
        ctx.lineTo(x - 18 * k, h * 0.8);
        ctx.closePath();
        ctx.fill();
      }
    }
    const blink = Math.floor(time * 2) % 2 === 0;
    drawText(ctx, 'PLEASE STAND BY', w / 2, h * 0.62, { align: 'center', scale: 2 * k, color: '#ffd8a0', shadow: '#401000' });
    drawText(ctx, `WARMING UP THE STUDIO ${Math.round(progress * 100)}%`, w / 2, h * 0.62 + 20 * k, { align: 'center', scale: k, color: blink ? '#c0a080' : '#806040' });
  }
}
