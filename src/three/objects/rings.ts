import * as THREE from "three";
import { palette, type SharedUniforms } from "../uniforms";

const ringVertex = /* glsl */ `
attribute float aT;
varying float vT;

void main() {
  vT = aT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ringFragment = /* glsl */ `
uniform float uTime;
uniform float uReveal;
uniform float uSpeed;
uniform float uDashes;
uniform vec3 uColor;
varying float vT;

void main() {
  // Bright scanning arc with a fading tail, over a faint dashed track.
  float sweep = fract(vT - uTime * uSpeed);
  float arc = pow(sweep, 8.0);
  float dash = step(0.4, fract(vT * uDashes));
  float alpha = (dash * 0.12 + arc * 0.9) * uReveal;
  gl_FragColor = vec4(uColor, alpha);
  #include <colorspace_fragment>
}
`;

interface RingConfig {
  radius: number;
  tilt: [number, number, number];
  speed: number;
  dashes: number;
  color: THREE.Color;
}

const RINGS: RingConfig[] = [
  { radius: 2.45, tilt: [1.25, 0.2, 0], speed: 0.12, dashes: 160, color: palette.cyan },
  { radius: 2.7, tilt: [1.75, -0.45, 0.3], speed: -0.08, dashes: 90, color: palette.violet },
  { radius: 2.95, tilt: [1.45, 0.6, -0.2], speed: 0.05, dashes: 240, color: palette.blue },
];

function createRing(config: RingConfig, shared: SharedUniforms): THREE.Line {
  const segments = 360;
  const positions = new Float32Array((segments + 1) * 3);
  const t = new Float32Array(segments + 1);
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * config.radius;
    positions[i * 3 + 1] = Math.sin(angle) * config.radius;
    t[i] = i / segments;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aT", new THREE.BufferAttribute(t, 1));

  const ring = new THREE.Line(
    geometry,
    new THREE.ShaderMaterial({
      vertexShader: ringVertex,
      fragmentShader: ringFragment,
      uniforms: {
        uTime: shared.uTime,
        uReveal: shared.uReveal,
        uSpeed: { value: config.speed },
        uDashes: { value: config.dashes },
        uColor: { value: config.color },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.rotation.set(...config.tilt);
  ring.renderOrder = 4;
  return ring;
}

export function createRings(shared: SharedUniforms): THREE.Group {
  const group = new THREE.Group();
  for (const config of RINGS) group.add(createRing(config, shared));
  return group;
}
