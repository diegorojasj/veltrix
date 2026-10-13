import * as THREE from "three";

const canvas = document.querySelector<HTMLCanvasElement>("#webgl");
const scene = new THREE.Scene();
const clock = new THREE.Clock();
const time = clock.getElapsedTime();

if (!canvas) {
  throw new Error("WebGL canvas was not found.");
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true
})

// Renderer config
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.setClearColor(0x000000, 0);

const geometry = new THREE.SphereGeometry(1.4, 128, 128);

const material = new THREE.MeshStandardMaterial({
  color: "#777dff",
  metalness: 0.65,
  roughness: 0.3,
  emissive: "#2420a0",
  emissiveIntensity: 0.8,
});

const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

// Sphere config
sphere.rotation.y = time * 0.12;
sphere.rotation.x = Math.sin(time * 0.3) * 0.08;

const pulse = 1 + Math.sin(time * 1.2) * 0.025;
sphere.scale.setScalar(pulse);

const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 0, 7);

renderer.render(scene, camera);
