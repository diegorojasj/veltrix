import * as THREE from "three";
import { simplexNoise } from "../shaders/chunks";
import { palette, type SharedUniforms } from "../uniforms";

const RADIUS = 1.4;

// Displacement shared by the core surface and its lattice shell.
const displace = /* glsl */ `
uniform vec3 uPointer;
uniform float uPointerStrength;
uniform vec3 uClickDir;
uniform float uClickTime;

// Shockwave ring expanding across the surface from the last click.
float ripple(vec3 n, float time) {
  float age = time - uClickTime;
  if (age < 0.0 || age > 3.0) return 0.0;
  float angle = acos(clamp(dot(n, uClickDir), -1.0, 1.0));
  float front = age * 1.6;
  return exp(-pow((angle - front) * 7.0, 2.0)) * exp(-age * 1.4);
}

float displacement(vec3 n, float time) {
  float t = time * 0.22;
  float d = snoise(n * 1.4 + vec3(t, t * 0.6, -t)) * 0.55
          + snoise(n * 3.2 - vec3(t * 1.4)) * 0.22
          + snoise(n * 7.0 + vec3(0.0, t * 2.0, 0.0)) * 0.06;
  // Surface swells toward the cursor.
  float focus = pow(max(dot(n, uPointer), 0.0), 5.0) * uPointerStrength;
  return d * 0.14 + focus * 0.22 + ripple(n, time) * 0.12;
}
`;

const coreVertex = /* glsl */ `
${simplexNoise}
${displace}
uniform float uTime;
uniform float uRadius;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vObjDir;
varying float vDisp;
varying float vFocus;

vec3 surface(vec3 n) {
  return n * (uRadius + displacement(n, uTime));
}

void main() {
  vec3 n = normalize(position);

  // Recompute the normal from neighbouring displaced samples.
  vec3 tangent = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
  vec3 bitangent = cross(n, tangent);
  float eps = 0.01;
  vec3 p0 = surface(n);
  vec3 p1 = surface(normalize(n + tangent * eps));
  vec3 p2 = surface(normalize(n + bitangent * eps));
  vec3 displacedNormal = normalize(cross(p1 - p0, p2 - p0));

  vec4 world = modelMatrix * vec4(p0, 1.0);
  vNormal = normalize(mat3(modelMatrix) * displacedNormal);
  vViewDir = normalize(cameraPosition - world.xyz);
  vObjDir = n;
  vDisp = displacement(n, uTime);
  vFocus = pow(max(dot(n, uPointer), 0.0), 5.0) * uPointerStrength;

  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const coreFragment = /* glsl */ `
${simplexNoise}
${displace}
uniform float uTime;
uniform float uReveal;
uniform vec3 uDeep;
uniform vec3 uBlue;
uniform vec3 uViolet;
uniform vec3 uCyan;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vObjDir;
varying float vDisp;
varying float vFocus;

void main() {
  vec3 normal = normalize(vNormal);
  float facing = clamp(dot(normal, normalize(vViewDir)), 0.0, 1.0);
  float fresnel = pow(1.0 - facing, 2.6);

  // Body: deep indigo valleys rising into violet crests.
  vec3 body = mix(uDeep, uBlue, smoothstep(-0.12, 0.05, vDisp));
  body = mix(body, uViolet, smoothstep(0.02, 0.16, vDisp));

  // Energy veins flowing across the surface.
  float flow = snoise(vObjDir * 2.4 + vec3(0.0, uTime * 0.18, uTime * 0.1));
  float veins = pow(1.0 - abs(flow), 18.0);
  float fineFlow = snoise(vObjDir * 6.0 - vec3(uTime * 0.25));
  veins += pow(1.0 - abs(fineFlow), 30.0) * 0.35;

  // Holographic scanlines drifting upward.
  float scan = smoothstep(0.9, 1.0, sin(vObjDir.y * 90.0 - uTime * 2.0)) * 0.08;

  // Soft key light from the upper left.
  float key = clamp(dot(normal, normalize(vec3(-0.5, 0.7, 0.6))), 0.0, 1.0);

  vec3 color = body * (0.25 + key * 0.55);
  color += veins * mix(uCyan, uViolet, 0.35) * 1.4;
  color += fresnel * mix(uBlue, uCyan, fresnel) * 1.8;
  color += vFocus * uCyan * 0.7;
  color += scan * uCyan;
  color += ripple(vObjDir, uTime) * mix(uCyan, vec3(1.0), 0.4) * 1.6;

  float alpha = clamp(0.78 + fresnel * 0.4 + veins * 0.3, 0.0, 1.0) * uReveal;
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}
`;

const shellVertex = /* glsl */ `
${simplexNoise}
${displace}
uniform float uTime;
uniform float uRadius;
varying float vFacing;

void main() {
  vec3 n = normalize(position);
  vec3 p = n * (uRadius + displacement(n, uTime) * 0.6);
  vec4 world = modelMatrix * vec4(p, 1.0);
  vec3 worldNormal = normalize(mat3(modelMatrix) * n);
  vFacing = dot(worldNormal, normalize(cameraPosition - world.xyz));
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const shellFragment = /* glsl */ `
uniform float uTime;
uniform float uReveal;
uniform vec3 uColor;
varying float vFacing;

void main() {
  // Lattice glows strongest at the silhouette.
  float rim = pow(1.0 - abs(vFacing), 1.5);
  float alpha = (0.025 + rim * 0.16) * (0.85 + 0.15 * sin(uTime * 1.6)) * uReveal;
  gl_FragColor = vec4(uColor, alpha);
  #include <colorspace_fragment>
}
`;

export interface CoreObject {
  group: THREE.Group;
  /** Mesh whose local space the pointer direction is expressed in. */
  surface: THREE.Mesh;
  pointer: THREE.IUniform<THREE.Vector3>;
  pointerStrength: THREE.IUniform<number>;
  /** Start a ripple from `localDir` (surface-local space). */
  ripple(localDir: THREE.Vector3): void;
  radius: number;
}

export function createCore(shared: SharedUniforms): CoreObject {
  const group = new THREE.Group();
  const pointer = { value: new THREE.Vector3(0, 0, 1) };
  const pointerStrength = { value: 0 };
  const clickDir = { value: new THREE.Vector3(0, 0, 1) };
  const clickTime = { value: -1000 };

  const surface = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 40),
    new THREE.ShaderMaterial({
      vertexShader: coreVertex,
      fragmentShader: coreFragment,
      uniforms: {
        uTime: shared.uTime,
        uReveal: shared.uReveal,
        uRadius: { value: RADIUS },
        uPointer: pointer,
        uPointerStrength: pointerStrength,
        uClickDir: clickDir,
        uClickTime: clickTime,
        uDeep: { value: palette.deep },
        uBlue: { value: palette.blue },
        uViolet: { value: palette.violet },
        uCyan: { value: palette.cyan },
      },
      transparent: true,
    }),
  );
  surface.renderOrder = 1;

  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 7),
    new THREE.ShaderMaterial({
      vertexShader: shellVertex,
      fragmentShader: shellFragment,
      uniforms: {
        uTime: shared.uTime,
        uReveal: shared.uReveal,
        uRadius: { value: RADIUS * 1.12 },
        uPointer: pointer,
        uPointerStrength: pointerStrength,
        uClickDir: clickDir,
        uClickTime: clickTime,
        uColor: { value: palette.violet },
      },
      wireframe: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  shell.renderOrder = 2;

  // Shell is a child so it inherits the surface rotation and the shared pointer space.
  surface.add(shell);
  group.add(surface);

  const ripple = (localDir: THREE.Vector3) => {
    clickDir.value.copy(localDir).normalize();
    clickTime.value = shared.uTime.value;
  };

  return { group, surface, pointer, pointerStrength, ripple, radius: RADIUS };
}
