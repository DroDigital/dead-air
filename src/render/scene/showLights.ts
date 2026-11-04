/**
 * Show lighting that the PSX shader's four point lights can't carry on their own:
 *
 *  - volumetric beams (additive cones with a soft, view-dependent edge): the wheel spotlight and
 *    two moving heads on the truss that sweep the curtain, change colour with the moment
 *    (idle wash, party sweep on big wins, red alarm strobe on Bankrupt, dead on game over);
 *  - lit signs: APPLAUSE (flashes when the audience is cued) and ON AIR (a tally light).
 */
import * as THREE from 'three';
import { drawText, textWidth } from '../../ui/bitfont';
import { CanvasPanel, panelMesh } from './util';

export type LightMode = 'idle' | 'party' | 'alarm' | 'tense' | 'off';

const BEAM_VERT = /* glsl */ `
varying float vAlong;
varying float vEdge;
void main() {
  vAlong = uv.y;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vec3 v = normalize(cameraPosition - wp.xyz);
  vEdge = abs(dot(n, v));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
varying float vAlong;
varying float vEdge;
void main() {
  // Bright at the lamp, fading toward the floor; soft edges; a slow shimmer of dust in the air.
  float a = pow(vAlong, 1.6) * pow(vEdge, 1.8);
  a *= 0.85 + 0.15 * sin(uTime * 3.0 + vAlong * 20.0);
  gl_FragColor = vec4(uColor * a * uIntensity, 1.0);
}
`;

class Beam {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  constructor(length: number, radius: number) {
    // Cone apex at the origin, opening along −Y; uv.y = 1 at the lamp, 0 at the far end.
    const geo = new THREE.CylinderGeometry(0.04, radius, length, 14, 1, true);
    geo.translate(0, -length / 2, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uIntensity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
  }
  /** Point the cone from its lamp position toward a world target. */
  aim(from: THREE.Vector3, to: THREE.Vector3): void {
    this.mesh.position.copy(from);
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  }
}

class Sign {
  readonly panel: CanvasPanel;
  readonly mesh: THREE.Mesh;
  private lit = -1;
  constructor(
    private text: string,
    private on: string,
    private off: string,
    w: number,
  ) {
    this.panel = new CanvasPanel(Math.max(32, textWidth(text) + 8), 11);
    this.mesh = panelMesh(this.panel, w, (w * 11) / this.panel.w, { fog: 0.15 });
    this.draw(0);
  }
  draw(level: number): void {
    const q = Math.round(level * 4) / 4;
    if (q === this.lit) return;
    this.lit = q;
    this.panel.draw((ctx, w, h) => {
      ctx.fillStyle = '#120806';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = q > 0 ? this.on : '#2a1410';
      ctx.fillRect(0, 0, w, 1);
      ctx.fillRect(0, h - 1, w, 1);
      ctx.fillRect(0, 0, 1, h);
      ctx.fillRect(w - 1, 0, 1, h);
      ctx.globalAlpha = 0.35 + 0.65 * q;
      drawText(ctx, this.text, w / 2, 2, { align: 'center', color: q > 0 ? this.on : this.off });
      ctx.globalAlpha = 1;
    });
  }
}

export class ShowLights {
  readonly group = new THREE.Group();
  private spot = new Beam(4.6, 1.15);
  private heads = [new Beam(4.2, 0.55), new Beam(4.2, 0.55)];
  private applauseSign = new Sign('APPLAUSE', '#ffe8a0', '#5a3018', 1.45);
  private onAirSign = new Sign('ON AIR', '#ff3020', '#4a1410', 1.0);
  /** Warm pool of light on the stage floor under the wheel. */
  private pool: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  mode: LightMode = 'idle';
  /** Seconds the APPLAUSE sign stays lit. */
  applause = 0;
  onAir = true;
  /** 0..1, from the studio (Bankrupt blackout, game over). */
  level = 1;
  spotLevel = 1;
  private modeT = 0;
  private color = [new THREE.Color(), new THREE.Color()];
  reducedFlashing = false;

  constructor() {
    this.group.add(this.spot.mesh, ...this.heads.map((h) => h.mesh), this.applauseSign.mesh, this.onAirSign.mesh);
    // The wheel spotlight beam (matches the PSX spot in studio.ts).
    this.spot.aim(new THREE.Vector3(0, 3.8, 2.6), new THREE.Vector3(0, 1.0, -0.5));
    this.spot.mat.uniforms.uColor.value.setRGB(1.0, 0.92, 0.75);
    this.applauseSign.mesh.position.set(-1.75, 2.85, -1.0);
    this.applauseSign.mesh.rotation.y = 0.35;
    this.onAirSign.mesh.position.set(1.75, 2.85, -1.0);
    this.onAirSign.mesh.rotation.y = -0.35;
    this.pool = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 24),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(1.0, 0.85, 0.6) }, uIntensity: { value: 0.3 } },
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 uColor; uniform float uIntensity; varying vec2 vP; void main(){ float r = length(vP) / 1.7; float a = smoothstep(1.0, 0.2, r); gl_FragColor = vec4(uColor * a * uIntensity, 1.0); }',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.scale.set(1.3, 0.75, 1);
    this.pool.position.set(0, 0.19, -0.35);
    this.pool.renderOrder = 4;
    this.group.add(this.pool);
  }

  setMode(m: LightMode): void {
    if (m !== this.mode) this.modeT = 0;
    this.mode = m;
  }

  update(dt: number, time: number): void {
    this.modeT += dt;
    this.applause = Math.max(0, this.applause - dt);
    const lv = this.level;
    // Spot beam.
    this.spot.mat.uniforms.uIntensity.value = 0.55 * this.spotLevel * lv;
    this.spot.mat.uniforms.uTime.value = time;
    this.pool.material.uniforms.uIntensity.value = 0.28 * this.spotLevel * lv * (this.mode === 'alarm' ? 0.4 : 1);
    // Moving heads on the truss.
    const m = this.mode;
    const speed = m === 'party' ? 2.6 : m === 'alarm' ? 0.4 : m === 'tense' ? 0.25 : 0.32;
    this.heads.forEach((h, i) => {
      const side = i === 0 ? -1 : 1;
      const ph = time * speed + i * Math.PI;
      const tx = side * (0.6 + Math.sin(ph) * 1.2);
      const tz = -1.9 + Math.cos(ph * 0.7) * 0.4;
      h.aim(new THREE.Vector3(side * 1.44, 3.3, 0.75), new THREE.Vector3(tx, m === 'party' ? 1.2 + Math.sin(ph * 1.3) * 0.8 : 0.5, tz));
      const c = this.color[i];
      if (m === 'party') c.setHSL((time * 0.25 + i * 0.5) % 1, 0.85, 0.55);
      else if (m === 'alarm') c.setRGB(1, 0.08, 0.04);
      else if (m === 'tense') c.setRGB(0.7, 0.05, 0.08);
      else c.setRGB(i === 0 ? 0.85 : 0.25, i === 0 ? 0.25 : 0.55, i === 0 ? 0.7 : 1.0);
      h.mat.uniforms.uColor.value.copy(c);
      let k = m === 'off' ? 0 : m === 'party' ? 0.75 : m === 'alarm' ? (this.reducedFlashing ? 0.4 : Math.floor(time * 8) % 2 ? 0.9 : 0.05) : 0.38;
      if (m === 'tense') k = 0.25 + 0.2 * Math.max(0, Math.sin(time * 6.5));
      h.mat.uniforms.uIntensity.value = k * lv;
      h.mat.uniforms.uTime.value = time + i;
    });
    // Signs.
    const blink = this.reducedFlashing ? 1 : Math.floor(time * 4) % 2 ? 1 : 0.55;
    this.applauseSign.draw(this.applause > 0 ? blink * lv : 0.0);
    this.onAirSign.draw(this.onAir ? (0.75 + 0.25 * Math.sin(time * 2)) * Math.max(0.3, lv) : 0);
    if (m === 'party' && this.modeT > 3) this.setMode('idle');
    if (m === 'alarm' && this.modeT > 1.6) this.setMode('idle');
  }
}
