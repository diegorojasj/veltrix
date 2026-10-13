import * as THREE from "three";
import { palette, type SharedUniforms } from "../uniforms";

const DUST_COUNT = 900;

const haloVertex = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const haloFragment = /* glsl */ `
uniform float uTime;
uniform float uReveal;
uniform vec3 uInner;
uniform vec3 uOuter;
varying vec2 vUv;

void main() {
  float d = length(vUv - 0.5) * 2.0;
  float glow = exp(-d * d * 4.5) * 0.45 + exp(-d * d * 14.0) * 0.35;
  glow *= 0.9 + 0.1 * sin(uTime * 1.3);
  glow *= 1.0 - smoothstep(0.8, 1.0, d);
  vec3 color = mix(uInner, uOuter, smoothstep(0.1, 0.7, d));
  gl_FragColor = vec4(color, glow * uReveal);
  #include <colorspace_fragment>
}
`;

const dustVertex = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uPixelRatio;
varying float vAlpha;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vAlpha = 0.25 + 0.35 * sin(uTime * (0.5 + aSeed) + aSeed * 30.0);
  gl_PointSize = (1.0 + aSeed * 2.0) * uPixelRatio * (10.0 / -mv.z);
}
`;

const dustFragment = /* glsl */ `
uniform float uReveal;
uniform vec3 uColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float alpha = smoothstep(0.5, 0.0, d) * max(vAlpha, 0.0) * uReveal;
  gl_FragColor = vec4(uColor, alpha);
  #include <colorspace_fragment>
}
`;

/** Soft volumetric glow behind the sphere. Billboard it toward the camera each frame. */
export function createHalo(shared: SharedUniforms): THREE.Mesh {
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.ShaderMaterial({
      vertexShader: haloVertex,
      fragmentShader: haloFragment,
      uniforms: {
        uTime: shared.uTime,
        uReveal: shared.uReveal,
        uInner: { value: palette.violet },
        uOuter: { value: palette.blue },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.renderOrder = 0;
  return halo;
}

/** Faint particle field drifting around the sphere. */
export function createDust(shared: SharedUniforms): THREE.Points {
  const positions = new Float32Array(DUST_COUNT * 3);
  const seeds = new Float32Array(DUST_COUNT);
  const v = new THREE.Vector3();
  for (let i = 0; i < DUST_COUNT; i++) {
    v.randomDirection().multiplyScalar(2.6 + Math.pow(Math.random(), 1.5) * 4.5);
    v.toArray(positions, i * 3);
    seeds[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

  const dust = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      uniforms: {
        uTime: shared.uTime,
        uReveal: shared.uReveal,
        uPixelRatio: shared.uPixelRatio,
        uColor: { value: palette.white },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  dust.renderOrder = 5;
  return dust;
}
