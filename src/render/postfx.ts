/**
 * Post chain:
 *   scene → rtScene (internal res, nearest)
 *   pass 1 (internal res): composite UI overlay, 15-bit quantise + 4×4 Bayer dither, fades
 *   pass 2 (screen): integer-scale nearest upscale, letterboxed, optional CRT
 *                    (scanlines, barrel, chromatic fringe, vignette, tracking roll)
 */
import * as THREE from 'three';
import { INTERNAL_H, INTERNAL_W } from '../core/config';

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const DITHER_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tUi;
uniform vec2 uRes;
uniform float uDither;
uniform float uFade;
uniform vec3 uFlash;
uniform float uFlashAmt;
uniform float uGlow;
uniform vec3 uGrade;
uniform float uSat;
uniform float uGrain;
uniform float uTime;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// Bright-pass bloom on the low-res frame: a sparse 12-tap star, cheap and pixel-crunchy.
vec3 glow(vec2 uv) {
  vec2 px = 1.0 / uRes;
  vec3 acc = vec3(0.0);
  for (int i = 1; i <= 3; i++) {
    float r = float(i) * 2.0;
    vec3 s1 = texture2D(tScene, uv + vec2(px.x * r, 0.0)).rgb;
    vec3 s2 = texture2D(tScene, uv - vec2(px.x * r, 0.0)).rgb;
    vec3 s3 = texture2D(tScene, uv + vec2(0.0, px.y * r)).rgb;
    vec3 s4 = texture2D(tScene, uv - vec2(0.0, px.y * r)).rgb;
    vec3 b = max(s1 - 0.62, 0.0) + max(s2 - 0.62, 0.0) + max(s3 - 0.62, 0.0) + max(s4 - 0.62, 0.0);
    acc += b / float(i);
  }
  return acc * 0.22;
}

float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0 - 0.5;
}

void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  c += glow(vUv) * uGlow;
  // Mood grade: tint + saturation (danger drains colour toward red, phone calls go cold).
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat) * uGrade;
  c += (hash(floor(vUv * uRes) + fract(uTime) * 91.0) - 0.5) * uGrain;
  c = mix(c, uFlash, uFlashAmt);
  c *= uFade;
  vec4 ui = texture2D(tUi, vUv);
  c = mix(c, ui.rgb, ui.a);
  // 15-bit colour: 5 bits per channel, ordered dither before truncation.
  vec2 px = floor(vUv * uRes);
  float d = bayer4(px) * uDither;
  c = floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5 + d) / 31.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

const CRT_FRAG = /* glsl */ `
uniform sampler2D tLow;
uniform vec2 uRes;
uniform float uCrt;
uniform float uTime;
uniform float uRoll;
uniform float uScanStrength;
uniform float uShock;
uniform float uVig;
varying vec2 vUv;

vec2 barrel(vec2 uv, float k) {
  vec2 c = uv * 2.0 - 1.0;
  float r2 = dot(c, c);
  c *= 1.0 + k * r2;
  return c * 0.5 + 0.5;
}

void main() {
  vec2 uv = vUv;
  if (uCrt < 0.5) {
    gl_FragColor = vec4(texture2D(tLow, uv).rgb, 1.0);
    return;
  }
  uv = barrel(uv, 0.06 + uShock * 0.05);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  // Tracking roll: a band that drifts down and shears lines sideways.
  float band = 0.0;
  if (uRoll > 0.0) {
    float pos = fract(uTime * 0.35);
    float dy = abs(uv.y - (1.0 - pos));
    band = smoothstep(0.08, 0.0, dy) * uRoll;
    float line = floor(uv.y * uRes.y);
    uv.x += band * 0.03 * sin(line * 1.7 + uTime * 40.0);
    uv.x += uRoll * 0.004 * sin(uTime * 13.0 + line * 0.3);
  }
  float px = 1.0 / uRes.x;
  float fr = 0.6 + 0.6 * uRoll + uShock * 3.5;
  vec3 col;
  col.r = texture2D(tLow, uv + vec2(px * fr, 0.0)).r;
  col.g = texture2D(tLow, uv).g;
  col.b = texture2D(tLow, uv - vec2(px * fr, 0.0)).b;
  // Scanlines at internal-pixel frequency.
  float s = sin(uv.y * uRes.y * 3.14159265);
  col *= mix(1.0, 0.72 + 0.28 * s * s, uScanStrength);
  // Vignette.
  vec2 v = uv * (1.0 - uv.yx);
  col *= pow(clamp(v.x * v.y * 18.0, 0.0, 1.0), 0.28 + uVig);
  col += band * 0.12;
  gl_FragColor = vec4(col, 1.0);
}
`;

export class PostFx {
  readonly rtScene: THREE.WebGLRenderTarget;
  readonly rtLow: THREE.WebGLRenderTarget;
  readonly uiCanvas: HTMLCanvasElement;
  readonly ui: CanvasRenderingContext2D;
  private uiTex: THREE.CanvasTexture;
  private quad: THREE.Mesh;
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private ditherMat: THREE.ShaderMaterial;
  private crtMat: THREE.ShaderMaterial;
  private fsScene = new THREE.Scene();
  scale = 1;
  crt = true;
  roll = 0;
  fade = 1;
  flashAmt = 0;
  flashColor = new THREE.Color(1, 1, 1);
  dither = true;
  /** Bloom strength (0 = off). */
  glow = 0.9;
  /** Colour grade target (multiplier) and saturation; eased every frame. */
  readonly grade = new THREE.Color(1.02, 0.98, 0.92);
  sat = 1;
  private gradeNow = new THREE.Color(1.02, 0.98, 0.92);
  private satNow = 1;
  grain = 0.035;
  /** Impact shock 0..1 (chromatic split + barrel kick), decays on its own. */
  shock = 0;
  /** Extra vignette (heartbeat pulses, danger). */
  vig = 0;

  constructor(private renderer: THREE.WebGLRenderer) {
    const mk = () =>
      new THREE.WebGLRenderTarget(INTERNAL_W, INTERNAL_H, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: true,
        colorSpace: THREE.NoColorSpace,
      });
    this.rtScene = mk();
    this.rtLow = mk();
    this.uiCanvas = document.createElement('canvas');
    this.uiCanvas.width = INTERNAL_W;
    this.uiCanvas.height = INTERNAL_H;
    this.ui = this.uiCanvas.getContext('2d')!;
    this.ui.imageSmoothingEnabled = false;
    this.uiTex = new THREE.CanvasTexture(this.uiCanvas);
    this.uiTex.magFilter = THREE.NearestFilter;
    this.uiTex.minFilter = THREE.NearestFilter;
    this.uiTex.generateMipmaps = false;
    this.uiTex.colorSpace = THREE.NoColorSpace;
    this.uiTex.flipY = true;

    this.ditherMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.rtScene.texture },
        tUi: { value: this.uiTex },
        uRes: { value: new THREE.Vector2(INTERNAL_W, INTERNAL_H) },
        uDither: { value: 1 },
        uFade: { value: 1 },
        uFlash: { value: this.flashColor },
        uFlashAmt: { value: 0 },
        uGlow: { value: 0.9 },
        uGrade: { value: new THREE.Color(1, 1, 1) },
        uSat: { value: 1 },
        uGrain: { value: 0.035 },
        uTime: { value: 0 },
      },
      vertexShader: FS_VERT,
      fragmentShader: DITHER_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.crtMat = new THREE.ShaderMaterial({
      uniforms: {
        tLow: { value: this.rtLow.texture },
        uRes: { value: new THREE.Vector2(INTERNAL_W, INTERNAL_H) },
        uCrt: { value: 1 },
        uTime: { value: 0 },
        uRoll: { value: 0 },
        uScanStrength: { value: 1 },
        uShock: { value: 0 },
        uVig: { value: 0 },
      },
      vertexShader: FS_VERT,
      fragmentShader: CRT_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.ditherMat);
    this.quad.frustumCulled = false;
    this.fsScene.add(this.quad);
  }

  /** 1 = 320×180, 2 = 640×360. */
  setScale(s: number): void {
    this.scale = s;
    const w = INTERNAL_W * s,
      h = INTERNAL_H * s;
    this.rtScene.setSize(w, h);
    this.rtLow.setSize(w, h);
    this.uiCanvas.width = w;
    this.uiCanvas.height = h;
    this.ui.imageSmoothingEnabled = false;
    (this.ditherMat.uniforms.uRes.value as THREE.Vector2).set(w, h);
    (this.crtMat.uniforms.uRes.value as THREE.Vector2).set(w, h);
  }

  get width(): number {
    return INTERNAL_W * this.scale;
  }
  get height(): number {
    return INTERNAL_H * this.scale;
  }

  /** Screen rectangle (CSS px) the internal image occupies: integer scale, letterboxed. */
  viewport(cssW: number, cssH: number): { x: number; y: number; w: number; h: number; k: number } {
    const k0 = Math.min(cssW / this.width, cssH / this.height);
    const k = k0 >= 1 ? Math.floor(k0) : k0;
    const w = Math.round(this.width * k),
      h = Math.round(this.height * k);
    return { x: Math.floor((cssW - w) / 2), y: Math.floor((cssH - h) / 2), w, h, k };
  }

  render(scene: THREE.Scene, camera: THREE.Camera, time: number): void {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.setClearColor(0x050302, 1);
    r.clear(true, true, true);
    r.render(scene, camera);

    this.uiTex.needsUpdate = true;
    this.ditherMat.uniforms.uDither.value = this.dither ? 1 : 0;
    this.ditherMat.uniforms.uFade.value = this.fade;
    this.ditherMat.uniforms.uFlashAmt.value = this.flashAmt;
    const du = this.ditherMat.uniforms;
    this.gradeNow.lerp(this.grade, 0.06);
    this.satNow += (this.sat - this.satNow) * 0.06;
    (du.uGrade.value as THREE.Color).copy(this.gradeNow);
    du.uSat.value = this.satNow;
    du.uGlow.value = this.glow;
    du.uGrain.value = this.grain;
    du.uTime.value = time;
    this.shock = Math.max(0, this.shock - 0.035);
    this.quad.material = this.ditherMat;
    r.setRenderTarget(this.rtLow);
    r.render(this.fsScene, this.camera);

    const canvas = r.domElement;
    const dpr = r.getPixelRatio();
    const cssW = canvas.width / dpr,
      cssH = canvas.height / dpr;
    const vp = this.viewport(cssW, cssH);
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 1);
    r.setScissorTest(false);
    r.clear(true, true, true);
    r.setViewport(vp.x, cssH - vp.y - vp.h, vp.w, vp.h);
    this.crtMat.uniforms.uCrt.value = this.crt ? 1 : 0;
    this.crtMat.uniforms.uTime.value = time;
    this.crtMat.uniforms.uRoll.value = this.roll;
    this.crtMat.uniforms.uShock.value = this.shock;
    this.crtMat.uniforms.uVig.value = this.vig;
    this.crtMat.uniforms.uScanStrength.value = vp.k >= 2 ? 1 : 0.35;
    this.quad.material = this.crtMat;
    r.render(this.fsScene, this.camera);
    r.setViewport(0, 0, cssW, cssH);
  }

  /** Convert a CSS-pixel position on the canvas to internal pixel coords (or null if outside). */
  toInternal(cssX: number, cssY: number, cssW: number, cssH: number): { x: number; y: number } | null {
    const vp = this.viewport(cssW, cssH);
    const x = ((cssX - vp.x) / vp.w) * this.width;
    const y = ((cssY - vp.y) / vp.h) * this.height;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return { x, y };
  }
}
