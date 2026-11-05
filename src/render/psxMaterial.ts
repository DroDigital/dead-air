/**
 * The one PSX ShaderMaterial used for everything in the scene.
 *
 *  - Vertex snapping in clip space to the internal-resolution grid.
 *  - Affine texture mapping: GLSL ES 3.00 has no `noperspective`, so UVs are multiplied by
 *    clip.w in the vertex shader and divided back in the fragment shader (uWarp blends
 *    between perspective-correct (0) and fully affine (1)).
 *  - Gouraud (per-vertex) lighting: ambient + up to 4 point lights + 1 spotlight.
 *  - Linear distance fog to brown-black.
 * Colour quantisation and dithering happen in the post pass at internal resolution.
 */
import * as THREE from 'three';
import { INTERNAL_H, INTERNAL_W } from '../core/config';

export const MAX_POINT_LIGHTS = 4;

/** Uniforms shared by every PSX material (one object, referenced everywhere). */
export const PSX_SHARED = {
  uRes: { value: new THREE.Vector2(INTERNAL_W, INTERNAL_H) },
  uSnap: { value: 1.0 },
  uWarp: { value: 1.0 },
  // A little fill keeps the host and unlit studio corners legible around the
  // brighter wheel while preserving the warm, low-key lighting.
  uAmbient: { value: new THREE.Color(0.18, 0.14, 0.11) },
  uFogColor: { value: new THREE.Color(0.06, 0.035, 0.025) },
  uFogNear: { value: 3.5 },
  uFogFar: { value: 11.0 },
  uLightPos: { value: Array.from({ length: MAX_POINT_LIGHTS }, () => new THREE.Vector3(0, -100, 0)) },
  uLightColor: { value: Array.from({ length: MAX_POINT_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
  uLightRange: { value: new Array(MAX_POINT_LIGHTS).fill(1) },
  uSpotPos: { value: new THREE.Vector3(0, 5, 2) },
  uSpotDir: { value: new THREE.Vector3(0, -1, 0) },
  uSpotColor: { value: new THREE.Color(0, 0, 0) },
  uSpotCos: { value: new THREE.Vector2(0.9, 0.95) },
  uSpotRange: { value: 9 },
  /** Global light dimmer (Bankrupt lights-out, Game Over). */
  uDim: { value: 1.0 },
};

const VERT = /* glsl */ `
uniform vec2 uRes;
uniform float uSnap;
uniform float uWarp;
uniform vec3 uAmbient;
uniform vec3 uLightPos[${MAX_POINT_LIGHTS}];
uniform vec3 uLightColor[${MAX_POINT_LIGHTS}];
uniform float uLightRange[${MAX_POINT_LIGHTS}];
uniform vec3 uSpotPos;
uniform vec3 uSpotDir;
uniform vec3 uSpotColor;
uniform vec2 uSpotCos;
uniform float uSpotRange;
uniform float uDim;
uniform float uFogNear;
uniform float uFogFar;
uniform float uLit;
uniform float uWrap;
uniform vec4 uUvTransform;

varying vec3 vLight;
varying vec2 vUvW;
varying float vW;
varying float vFog;
varying vec3 vTint;

void main() {
  vec4 local = vec4(position, 1.0);
  vec3 nrm = normal;
#ifdef USE_INSTANCING
  local = instanceMatrix * local;
  nrm = mat3(instanceMatrix) * nrm;
#endif
  vec4 world = modelMatrix * local;
  vec3 N = normalize(mat3(modelMatrix) * nrm);
  vec4 view = viewMatrix * world;
  vec4 clip = projectionMatrix * view;

  // Vertex snap to the internal pixel grid (in clip space, w-aware).
  if (uSnap > 0.0 && clip.w > 0.0) {
    vec2 grid = uRes * 0.5;
    vec2 ndc = clip.xy / clip.w;
    vec2 snapped = floor(ndc * grid + 0.5) / grid;
    clip.xy = mix(ndc, snapped, uSnap) * clip.w;
  }
  gl_Position = clip;

  // Gouraud lighting.
  vec3 light = uAmbient;
  for (int i = 0; i < ${MAX_POINT_LIGHTS}; i++) {
    vec3 L = uLightPos[i] - world.xyz;
    float d = length(L);
    float att = clamp(1.0 - d / uLightRange[i], 0.0, 1.0);
    att *= att;
    float nd = (dot(N, L / max(d, 1e-4)) + uWrap) / (1.0 + uWrap);
    light += uLightColor[i] * max(nd, 0.0) * att;
  }
  {
    vec3 L = uSpotPos - world.xyz;
    float d = length(L);
    vec3 Ld = L / max(d, 1e-4);
    float cone = smoothstep(uSpotCos.x, uSpotCos.y, dot(-Ld, normalize(uSpotDir)));
    float att = clamp(1.0 - d / uSpotRange, 0.0, 1.0);
    float nd = (dot(N, Ld) + uWrap) / (1.0 + uWrap);
    light += uSpotColor * max(nd, 0.0) * cone * att;
  }
  vLight = mix(vec3(1.0), light * uDim, uLit);

  vTint = vec3(1.0);
#ifdef PSX_VCOLOR
  vTint *= color.rgb;
#endif
#ifdef USE_INSTANCING_COLOR
  vTint *= instanceColor;
#endif

  vec2 tuv = uv * uUvTransform.xy + uUvTransform.zw;
  float w = mix(1.0, clip.w, uWarp);
  vUvW = tuv * w;
  vW = w;
  vFog = smoothstep(uFogNear, uFogFar, -view.z);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uUseMap;
uniform vec3 uColor;
uniform vec3 uEmissive;
uniform float uOpacity;
uniform float uAlphaTest;
uniform vec3 uFogColor;
uniform float uFogAmount;
uniform float uDim;
uniform float uEmissiveDim;

varying vec3 vLight;
varying vec2 vUvW;
varying float vW;
varying float vFog;
varying vec3 vTint;

void main() {
  vec2 uv = vUvW / vW;
  vec4 tex = uUseMap > 0.5 ? texture2D(map, uv) : vec4(1.0);
  vec3 base = tex.rgb * uColor * vTint;
  vec3 c = base * vLight + uEmissive * mix(1.0, uDim, uEmissiveDim);
  c = mix(c, uFogColor, vFog * uFogAmount);
  float a = tex.a * uOpacity;
  if (a < uAlphaTest) discard;
  gl_FragColor = vec4(c, a);
}
`;

export interface PsxOptions {
  map?: THREE.Texture | null;
  color?: THREE.ColorRepresentation;
  emissive?: THREE.ColorRepresentation;
  /** 0 = unlit (screens, bulbs), 1 = lit. */
  lit?: boolean;
  transparent?: boolean;
  opacity?: number;
  alphaTest?: number;
  vertexColors?: boolean;
  side?: THREE.Side;
  fog?: number;
  /** Half-Lambert style wrap for softer falloff. */
  wrap?: number;
  depthWrite?: boolean;
  /** Emissive is dimmed by uDim (bulbs going dark). */
  emissiveDims?: boolean;
  uvRepeat?: [number, number];
}

export type PsxMaterial = THREE.ShaderMaterial & {
  uniforms: {
    map: { value: THREE.Texture | null };
    uUseMap: { value: number };
    uColor: { value: THREE.Color };
    uEmissive: { value: THREE.Color };
    uOpacity: { value: number };
    uAlphaTest: { value: number };
    uLit: { value: number };
    uWrap: { value: number };
    uFogAmount: { value: number };
    uEmissiveDim: { value: number };
    uUvTransform: { value: THREE.Vector4 };
  };
};

export function psxMaterial(o: PsxOptions = {}): PsxMaterial {
  const rep = o.uvRepeat ?? [1, 1];
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...PSX_SHARED,
      map: { value: o.map ?? null },
      uUseMap: { value: o.map ? 1 : 0 },
      uColor: { value: new THREE.Color(o.color ?? 0xffffff) },
      uEmissive: { value: new THREE.Color(o.emissive ?? 0x000000) },
      uOpacity: { value: o.opacity ?? 1 },
      uAlphaTest: { value: o.alphaTest ?? 0.01 },
      uLit: { value: o.lit === false ? 0 : 1 },
      uWrap: { value: o.wrap ?? 0.15 },
      uFogAmount: { value: o.fog ?? 1 },
      uEmissiveDim: { value: o.emissiveDims ? 1 : 0 },
      uUvTransform: { value: new THREE.Vector4(rep[0], rep[1], 0, 0) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: !!o.transparent,
    vertexColors: !!o.vertexColors,
    defines: o.vertexColors ? { PSX_VCOLOR: 1 } : {},
    side: o.side ?? THREE.FrontSide,
    depthWrite: o.depthWrite ?? !o.transparent,
  }) as PsxMaterial;
  return m;
}

export function setMap(m: PsxMaterial, tex: THREE.Texture | null): void {
  m.uniforms.map.value = tex;
  m.uniforms.uUseMap.value = tex ? 1 : 0;
}

/** Make a texture PSX-crunchy: nearest filtering, no mips, no colour management. */
export function psxTexture<T extends THREE.Texture>(t: T, repeat = true): T {
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.needsUpdate = true;
  return t;
}

/** Replace every material in an imported object with a PSX material (keeping the base colour map). */
export function conformToPsx(root: THREE.Object3D, opts: PsxOptions = {}): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const old = mesh.material as THREE.MeshStandardMaterial;
    const map = (old && 'map' in old ? old.map : null) ?? null;
    if (map) psxTexture(map, true);
    const color = old && 'color' in old && old.color ? old.color.getHex() : 0xffffff;
    mesh.material = psxMaterial({ map, color: opts.color ?? color, ...opts });
    if (Array.isArray(old)) old.forEach((x) => x.dispose());
    else old?.dispose();
  });
}

/** Clone a PSX material while keeping the shared light/fog uniforms and the same texture. */
export function clonePsx(m: PsxMaterial): PsxMaterial {
  const c = m.clone() as PsxMaterial;
  for (const k of Object.keys(PSX_SHARED) as (keyof typeof PSX_SHARED)[]) (c.uniforms as Record<string, unknown>)[k] = PSX_SHARED[k];
  c.uniforms.map.value = m.uniforms.map.value;
  return c;
}
