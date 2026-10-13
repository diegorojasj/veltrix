import * as THREE from "three";
import { breathe } from "../shaders/chunks";
import { palette, type SharedUniforms } from "../uniforms";

const NODE_COUNT = 220;
const LINKS_PER_NODE = 3;
const MAX_LINK_DISTANCE = 0.75;
/** Click-spawned nodes kept alive; past this the oldest slot is recycled. */
const MAX_SPAWNED = 300;
const SPAWN_RADIUS = 2.05;
/** Birth time for the initial nodes — far enough in the past that no spawn effect plays. */
const PREBORN = -1000;

const nodeVertex = /* glsl */ `
${breathe}
attribute float aSize;
attribute float aSeed;
attribute float aBirth;
uniform float uTime;
uniform float uPixelRatio;
varying float vTwinkle;
varying float vFlash;

void main() {
  vec4 mv = modelViewMatrix * vec4(breathe(position, uTime), 1.0);
  gl_Position = projectionMatrix * mv;
  float age = max(uTime - aBirth, 0.0);
  // New nodes pop in oversized and flare white before settling.
  float grow = smoothstep(0.0, 0.5, age);
  vFlash = exp(-age * 2.5);
  vTwinkle = 0.55 + 0.45 * sin(uTime * (1.0 + aSeed * 2.5) + aSeed * 40.0);
  gl_PointSize = aSize * uPixelRatio * (0.7 + vTwinkle * 0.5) * grow * (1.0 + vFlash * 2.5) * (10.0 / -mv.z);
}
`;

const nodeFragment = /* glsl */ `
uniform float uReveal;
uniform vec3 uColor;
uniform vec3 uCore;
varying float vTwinkle;
varying float vFlash;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float halo = pow(smoothstep(0.5, 0.0, d), 2.0);
  float core = smoothstep(0.14, 0.0, d);
  vec3 color = mix(uColor, uCore, max(core, vFlash));
  float twinkle = mix(vTwinkle, 1.0, vFlash);
  gl_FragColor = vec4(color, (halo * 0.8 + core) * twinkle * uReveal);
  #include <colorspace_fragment>
}
`;

const linkVertex = /* glsl */ `
${breathe}
attribute float aEnd;
attribute float aSeed;
attribute float aBirth;
uniform float uTime;
varying float vEnd;
varying float vSeed;
varying float vAge;

void main() {
  vEnd = aEnd;
  vSeed = aSeed;
  vAge = max(uTime - aBirth, 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(breathe(position, uTime), 1.0);
}
`;

const linkFragment = /* glsl */ `
uniform float uTime;
uniform float uReveal;
uniform vec3 uBase;
uniform vec3 uPulse;
varying float vEnd;
varying float vSeed;
varying float vAge;

void main() {
  // Spawned synapses draw outward from their new node, glowing as they connect.
  float reach = smoothstep(0.1, 0.9, vAge);
  if (vEnd > reach) discard;
  float birth = exp(-vAge * 1.8);

  // A signal travels along roughly half the synapses.
  float firing = step(0.45, fract(vSeed * 13.71));
  float head = fract(uTime * (0.18 + vSeed * 0.3) + vSeed * 7.0);
  float pulse = smoothstep(0.16, 0.0, abs(vEnd - head)) * firing;
  pulse = max(pulse, birth);
  vec3 color = mix(uBase, uPulse, pulse);
  float alpha = (0.16 + pulse * 0.9) * uReveal;
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}
`;

function fibonacciSphere(count: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    // Jittered radius gives the web some depth instead of a perfect shell.
    const radius = 1.85 + Math.random() * 0.45;
    points.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(radius));
  }
  return points;
}

/** Up to LINKS_PER_NODE nearest neighbours of `node` within MAX_LINK_DISTANCE. */
function nearestNodes(nodes: THREE.Vector3[], node: THREE.Vector3, self: number): number[] {
  return nodes
    .map((other, j) => ({ j, d: node.distanceTo(other) }))
    .filter(({ j, d }) => j !== self && d < MAX_LINK_DISTANCE)
    .sort((a, b) => a.d - b.d)
    .slice(0, LINKS_PER_NODE)
    .map(({ j }) => j);
}

function buildLinks(nodes: THREE.Vector3[]): [number, number][] {
  const seen = new Set<string>();
  const links: [number, number][] = [];
  nodes.forEach((node, i) => {
    for (const j of nearestNodes(nodes, node, i)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push([i, j]);
    }
  });
  return links;
}

export interface NetworkObject {
  group: THREE.Group;
  /** Grow a new node in the direction of `localDir` (network-local space), wired to its neighbours. */
  addNode(localDir: THREE.Vector3): void;
}

export function createNetwork(shared: SharedUniforms): NetworkObject {
  const group = new THREE.Group();
  const nodes = fibonacciSphere(NODE_COUNT);
  const links = buildLinks(nodes);
  const nodeCapacity = NODE_COUNT + MAX_SPAWNED;
  const linkCapacity = links.length + MAX_SPAWNED * LINKS_PER_NODE;

  // Buffers are sized for every spawnable node up front; draw ranges reveal them as they appear.
  const nodePositions = new Float32Array(nodeCapacity * 3);
  const nodeSizes = new Float32Array(nodeCapacity);
  const nodeSeeds = new Float32Array(nodeCapacity);
  const nodeBirths = new Float32Array(nodeCapacity).fill(PREBORN);
  nodes.forEach((node, i) => {
    node.toArray(nodePositions, i * 3);
    nodeSizes[i] = 2.5 + Math.random() * 4.5;
    nodeSeeds[i] = Math.random();
  });

  const nodeGeometry = new THREE.BufferGeometry();
  const nodePositionAttr = new THREE.BufferAttribute(nodePositions, 3);
  const nodeSizeAttr = new THREE.BufferAttribute(nodeSizes, 1);
  const nodeSeedAttr = new THREE.BufferAttribute(nodeSeeds, 1);
  const nodeBirthAttr = new THREE.BufferAttribute(nodeBirths, 1);
  nodeGeometry.setAttribute("position", nodePositionAttr);
  nodeGeometry.setAttribute("aSize", nodeSizeAttr);
  nodeGeometry.setAttribute("aSeed", nodeSeedAttr);
  nodeGeometry.setAttribute("aBirth", nodeBirthAttr);
  nodeGeometry.setDrawRange(0, NODE_COUNT);

  const points = new THREE.Points(
    nodeGeometry,
    new THREE.ShaderMaterial({
      vertexShader: nodeVertex,
      fragmentShader: nodeFragment,
      uniforms: {
        uTime: shared.uTime,
        uReveal: shared.uReveal,
        uPixelRatio: shared.uPixelRatio,
        uColor: { value: palette.cyan },
        uCore: { value: palette.white },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  points.renderOrder = 3;
  points.frustumCulled = false;

  const linkPositions = new Float32Array(linkCapacity * 6);
  // Each segment runs 0 → 1 from its first vertex to its second.
  const linkEnds = new Float32Array(linkCapacity * 2).map((_, i) => i % 2);
  const linkSeeds = new Float32Array(linkCapacity * 2);
  const linkBirths = new Float32Array(linkCapacity * 2).fill(PREBORN);
  const writeLink = (slot: number, from: THREE.Vector3, to: THREE.Vector3, birth: number) => {
    from.toArray(linkPositions, slot * 6);
    to.toArray(linkPositions, slot * 6 + 3);
    linkSeeds[slot * 2] = linkSeeds[slot * 2 + 1] = Math.random();
    linkBirths[slot * 2] = linkBirths[slot * 2 + 1] = birth;
  };
  links.forEach(([a, b], i) => writeLink(i, nodes[a], nodes[b], PREBORN));

  const linkGeometry = new THREE.BufferGeometry();
  const linkPositionAttr = new THREE.BufferAttribute(linkPositions, 3);
  const linkSeedAttr = new THREE.BufferAttribute(linkSeeds, 1);
  const linkBirthAttr = new THREE.BufferAttribute(linkBirths, 1);
  linkGeometry.setAttribute("position", linkPositionAttr);
  linkGeometry.setAttribute("aEnd", new THREE.BufferAttribute(linkEnds, 1));
  linkGeometry.setAttribute("aSeed", linkSeedAttr);
  linkGeometry.setAttribute("aBirth", linkBirthAttr);
  linkGeometry.setDrawRange(0, links.length * 2);

  const synapses = new THREE.LineSegments(
    linkGeometry,
    new THREE.ShaderMaterial({
      vertexShader: linkVertex,
      fragmentShader: linkFragment,
      uniforms: {
        uTime: shared.uTime,
        uReveal: shared.uReveal,
        uBase: { value: palette.blue },
        uPulse: { value: palette.cyan },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  synapses.renderOrder = 3;
  synapses.frustumCulled = false;

  group.add(synapses, points);

  let spawned = 0;
  const addNode = (localDir: THREE.Vector3) => {
    const slot = spawned % MAX_SPAWNED;
    const index = NODE_COUNT + slot;
    const birth = shared.uTime.value;
    const node = localDir.clone().normalize().multiplyScalar(SPAWN_RADIUS + Math.random() * 0.15);

    // Recycled slots replace the oldest spawned node.
    nodes[index] = node;
    node.toArray(nodePositions, index * 3);
    nodeSizes[index] = 5 + Math.random() * 3;
    nodeSeeds[index] = Math.random();
    nodeBirths[index] = birth;

    const neighbours = nearestNodes(nodes, node, index);
    for (let j = 0; j < LINKS_PER_NODE; j++) {
      const linkSlot = links.length + slot * LINKS_PER_NODE + j;
      // Unused slots collapse to a zero-length segment.
      const target = neighbours[j] === undefined ? node : nodes[neighbours[j]];
      writeLink(linkSlot, node, target, birth);
    }

    spawned++;
    const live = Math.min(spawned, MAX_SPAWNED);
    nodeGeometry.setDrawRange(0, NODE_COUNT + live);
    linkGeometry.setDrawRange(0, (links.length + live * LINKS_PER_NODE) * 2);
    for (const attr of [nodePositionAttr, nodeSizeAttr, nodeSeedAttr, nodeBirthAttr, linkPositionAttr, linkSeedAttr, linkBirthAttr]) {
      attr.needsUpdate = true;
    }
  };

  return { group, addNode };
}
