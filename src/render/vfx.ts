/**
 * Screen-space VFX drawn into the internal-resolution UI overlay: floating "+$X" / "×2"
 * text anchored to world positions, confetti, sparks. Everything is pixel-exact.
 */
import * as THREE from 'three';
import { drawText } from '../ui/bitfont';

interface Floater {
  world: THREE.Vector3;
  text: string;
  color: string;
  t: number;
  life: number;
  scale: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export class Vfx {
  private floaters: Floater[] = [];
  private particles: Particle[] = [];
  reducedFlashing = false;

  float(world: THREE.Vector3, text: string, color = '#ffe060', scale = 1, life = 1.4): void {
    this.floaters.push({ world: world.clone(), text, color, t: 0, life, scale });
  }

  /** Burst of particles at an internal-pixel position. */
  burst(x: number, y: number, n: number, colors: string[], speed = 60, size = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random());
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.5, life: 0.8 + Math.random() * 0.9, color: colors[i % colors.length], size });
    }
  }

  confetti(w: number, n = 80): void {
    const cols = ['#ff4040', '#ffd040', '#40c0ff', '#80ff60', '#ff80ff'];
    for (let i = 0; i < n; i++)
      this.particles.push({ x: Math.random() * w, y: -Math.random() * 40, vx: (Math.random() - 0.5) * 20, vy: 20 + Math.random() * 40, life: 3 + Math.random() * 2, color: cols[i % cols.length], size: 1 + (i % 2) });
  }

  update(dt: number): void {
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < f.life);
    for (const p of this.particles) {
      p.vy += 60 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.99;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D, camera: THREE.Camera, w: number, h: number, k: number): void {
    const v = new THREE.Vector3();
    for (const f of this.floaters) {
      v.copy(f.world).project(camera);
      if (v.z > 1) continue;
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h - f.t * 18 * k;
      const fade = f.t > f.life - 0.3 ? Math.floor(((f.life - f.t) / 0.3) * 4) % 2 : 1;
      if (fade) drawText(ctx, f.text, x, y, { align: 'center', color: f.color, shadow: '#000', scale: f.scale * k });
    }
    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size * k, p.size * k);
    }
  }
}
