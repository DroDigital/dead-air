/**
 * Composes the whole studio scene, the PSX post chain, the camera rig and picking.
 */
import * as THREE from 'three';
import type { Assets } from '../assets/loader';
import { drawText, textWidth } from '../ui/bitfont';
import { CameraRig } from './cameraRig';
import { PSX_SHARED } from './psxMaterial';
import { PostFx } from './postfx';
import { CabinetView } from './scene/cabinet';
import { CoinShower } from './scene/coins';
import { HostView } from './scene/host';
import { LeverView } from './scene/lever';
import { PhoneView } from './scene/phone';
import { ShelfView } from './scene/shelf';
import { ShowLights } from './scene/showLights';
import { StudioView } from './scene/studio';
import { TrayView } from './scene/tray';
import { CanvasPanel, panelMesh } from './scene/util';
import { VaultView } from './scene/vault';
import { WheelView } from './scene/wheel';
import { Vfx } from './vfx';
import { AudienceView } from './horror/audience';
import { CollateralView } from './horror/collateral';
import { RotView } from './horror/rotView';
import { WedgeModels } from './horror/wedgeModels';
import { WinJuice } from './winJuice';

export interface PickHit {
  id: string;
  uv: THREE.Vector2 | null;
  point: THREE.Vector3;
  object: THREE.Object3D;
  tooltip?: () => string;
}

export class Marquee {
  readonly panel = new CanvasPanel(128, 12);
  readonly mesh: THREE.Mesh;
  private text = '';
  private color = '#ffe060';
  private scroll = 0;
  private flash = 0;
  reduced = false;
  constructor() {
    this.mesh = panelMesh(this.panel, 3.0, 0.28, { fog: 0.1 });
    this.mesh.position.set(0, 3.12, -0.62);
    this.set('DEAD AIR', '#ff5030');
  }
  set(text: string, color = '#ffe060', flash = false): void {
    this.text = text;
    this.color = color;
    this.scroll = 0;
    if (flash && !this.reduced) this.flash = 1;
    this.draw();
  }
  private draw(): void {
    this.panel.draw((ctx, w, h) => {
      ctx.fillStyle = this.flash > 0 && Math.floor(this.flash * 10) % 2 ? '#3a1a04' : '#0c0604';
      ctx.fillRect(0, 0, w, h);
      for (let x = 2; x < w; x += 6) {
        ctx.fillStyle = (x / 6 + Math.floor(this.scroll * 8)) % 3 === 0 ? '#ffb040' : '#402010';
        ctx.fillRect(x, 0, 2, 1);
        ctx.fillRect(x, h - 1, 2, 1);
      }
      const tw = textWidth(this.text);
      const x = tw > w - 8 ? w - 4 - ((this.scroll * 40) % (tw + w)) + tw : w / 2 - tw / 2;
      drawText(ctx, this.text, Math.round(tw > w - 8 ? x - tw : x), 3, { color: this.color });
    });
  }
  update(dt: number): void {
    this.scroll += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.draw();
  }
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly post: PostFx;
  readonly rig: CameraRig;
  readonly studio: StudioView;
  readonly wheel: WheelView;
  readonly tray: TrayView;
  readonly vault: VaultView;
  readonly shelf: ShelfView;
  readonly cabinet: CabinetView;
  readonly host: HostView;
  readonly phone: PhoneView;
  readonly lever: LeverView;
  readonly marquee: Marquee;
  readonly lights = new ShowLights();
  readonly coins = new CoinShower();
  readonly vfx = new Vfx();
  readonly rot: RotView;
  readonly audience: AudienceView;
  readonly wedgeProps: WedgeModels;
  readonly collateral: CollateralView;
  readonly juice = new WinJuice();
  private raycaster = new THREE.Raycaster();
  stats = { calls: 0, triangles: 0 };

  constructor(readonly canvas: HTMLCanvasElement, assets: Assets) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.autoClear = false;
    this.post = new PostFx(this.renderer);
    this.rig = new CameraRig(16 / 9);
    this.raycaster.layers.enable(1);

    this.studio = new StudioView(assets);
    this.wheel = new WheelView(assets);
    this.tray = new TrayView();
    this.vault = new VaultView(assets);
    this.shelf = new ShelfView(assets);
    this.cabinet = new CabinetView(assets);
    this.host = new HostView(assets);
    this.phone = new PhoneView();
    this.lever = new LeverView();
    this.marquee = new Marquee();
    this.rot = new RotView(assets);
    this.audience = new AudienceView(assets);
    this.wedgeProps = new WedgeModels(this.rot.blood);
    this.wheel.attach(this.wedgeProps.group);
    this.collateral = new CollateralView(assets, this.rot.blood);
    this.scene.add(
      this.rot.group,
      this.audience.group,
      this.collateral.group,
      this.juice.group,
      this.studio.group,
      this.wheel.group,
      this.tray.group,
      this.vault.group,
      this.shelf.group,
      this.cabinet.group,
      this.host.group,
      this.phone.group,
      this.lever.group,
      this.marquee.mesh,
      this.lights.group,
      this.coins.mesh,
    );
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // The internal picture takes the window's shape, so nothing is letterboxed.
    this.post.setAspect(w / Math.max(1, h));
    PSX_SHARED.uRes.value.set(this.post.width, this.post.height);
  }

  setWarp(w: number): void {
    // Warp strength 0..1 blends perspective-correct → fully affine. Vertex snapping stays on.
    PSX_SHARED.uWarp.value = Math.max(0, Math.min(1, w));
  }

  setScale(s: number): void {
    this.post.setScale(s);
    PSX_SHARED.uRes.value.set(this.post.width, this.post.height);
  }

  /** Raycast from an internal-resolution pixel. */
  pick(ix: number, iy: number): PickHit | null {
    const ndc = new THREE.Vector2((ix / this.post.width) * 2 - 1, -(iy / this.post.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (!o) {
        // An opaque, non-pickable surface in front blocks the pick (except glass).
        const mat = (h.object as THREE.Mesh).material as THREE.Material | undefined;
        if (mat && !mat.transparent && (h.object as THREE.Mesh).isMesh) return null;
        continue;
      }
      return { id: o.userData.pick as string, uv: h.uv ?? null, point: h.point, object: o, tooltip: o.userData.tooltip };
    }
    return null;
  }

  update(dt: number, time: number, speed: number): void {
    this.studio.update(dt, time);
    this.wheel.update(dt, time, speed);
    this.tray.update(dt, time);
    this.vault.update(dt, time, speed);
    this.shelf.update(dt, time);
    this.cabinet.update(dt, time);
    this.host.light = this.studio.lightLevel;
    this.host.update(dt, time);
    this.phone.update(dt, time);
    this.lever.update(dt);
    this.marquee.update(dt);
    this.lights.level = this.studio.lightLevel;
    this.lights.spotLevel = this.studio.spotLevel;
    this.lights.update(dt, time);
    this.coins.update(dt);
    this.vfx.update(dt);
    this.rot.update(dt, time);
    this.audience.update(dt);
    this.wedgeProps.update(dt, time, this.rig.camera);
    this.collateral.update(dt);
    this.juice.update(dt, time);
    this.rig.apply(time, dt);
  }

  render(time: number): void {
    const aspect = this.post.width / this.post.height;
    if (Math.abs(this.rig.camera.aspect - aspect) > 1e-3) this.rig.setAspect(aspect);
    this.renderer.info.reset();
    this.renderer.info.autoReset = false;
    this.post.render(this.scene, this.rig.camera, time);
    this.stats.calls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
  }
}
