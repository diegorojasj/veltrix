import * as THREE from "three";
import { createDust, createHalo } from "./objects/atmosphere";
import { createCore } from "./objects/core";
import { createNetwork } from "./objects/network";
import { createRings } from "./objects/rings";
import { createSharedUniforms } from "./uniforms";

/** Radius the camera keeps in frame, so the rings never clip on narrow screens. */
const FIT_RADIUS = 3.1;
const REVEAL_SECONDS = 2.2;

/** Clicks on these pass through to the UI instead of the sphere. */
const INTERACTIVE = "a, button, input, select, textarea, label, [role='button'], [contenteditable]";

export interface VeltrixSceneOptions {
  /** Called after each click that lands on the sphere grows a new node. */
  onSphereClick?: () => void;
}

export interface VeltrixScene {
  dispose(): void;
}

export function createVeltrixScene(
  canvas: HTMLCanvasElement,
  options: VeltrixSceneOptions = {},
): VeltrixScene {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const motion = reducedMotion ? 0.25 : 1;

  // Transparent canvas: alpha buffer, zero-opacity clear and no scene.background.
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const shared = createSharedUniforms();

  const rig = new THREE.Group();
  const core = createCore(shared);
  const network = createNetwork(shared);
  const rings = createRings(shared);
  const dust = createDust(shared);
  const halo = createHalo(shared);
  rig.add(core.group, network.group, rings);
  scene.add(halo, rig, dust);

  // --- Pointer -------------------------------------------------------------
  const pointer = new THREE.Vector2();
  const pointerSmooth = new THREE.Vector2();
  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const hitSphere = new THREE.Sphere(new THREE.Vector3(), core.radius * 1.1);
  const hit = new THREE.Vector3();
  const pointerDirTarget = new THREE.Vector3(0, 0, 1);
  const clickNdc = new THREE.Vector2();
  const clickHit = new THREE.Vector3();
  let pointerActive = false;
  let hovering = false;

  const toNdc = (event: MouseEvent, target: THREE.Vector2) => {
    const rect = canvas.getBoundingClientRect();
    return target.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  };
  const isOverUi = (event: Event) =>
    event.target instanceof Element && event.target.closest(INTERACTIVE) !== null;

  const onPointerMove = (event: PointerEvent) => {
    toNdc(event, pointer);
    pointerActive = !isOverUi(event);
  };

  // Each click on the sphere ripples the core and grows one more neural node there.
  const onClick = (event: MouseEvent) => {
    if (isOverUi(event)) return;
    raycaster.setFromCamera(toNdc(event, clickNdc), camera);
    if (!raycaster.ray.intersectSphere(hitSphere, clickHit)) return;

    rig.updateWorldMatrix(true, true);
    core.ripple(core.surface.worldToLocal(clickHit.clone()));
    network.addNode(network.group.worldToLocal(clickHit));
    options.onSphereClick?.();
  };
  const onPointerLeave = () => {
    pointerActive = false;
  };
  // The canvas is pointer-events: none, so listen on the window instead.
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("click", onClick);
  document.documentElement.addEventListener("pointerleave", onPointerLeave);

  // --- Sizing --------------------------------------------------------------
  const resize = () => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio, 2);

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    shared.uPixelRatio.value = pixelRatio;

    camera.aspect = width / height;
    const vFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hFov = Math.atan(Math.tan(vFov) * camera.aspect);
    camera.position.z = FIT_RADIUS / Math.sin(Math.min(vFov, hFov));
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  // --- Loop ----------------------------------------------------------------
  const start = performance.now();
  let last = start;

  renderer.setAnimationLoop((now: number) => {
    const elapsed = (now - start) / 1000;
    // Clamp delta so returning to a backgrounded tab doesn't jump.
    const delta = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    const time = elapsed * motion;
    const ease = 1 - Math.exp(-delta * 4);

    shared.uTime.value = time;
    const reveal = Math.min(elapsed / REVEAL_SECONDS, 1);
    shared.uReveal.value = 1 - Math.pow(1 - reveal, 3);
    rig.scale.setScalar(0.75 + 0.25 * shared.uReveal.value);

    // Idle spin with counter-rotating layers.
    core.surface.rotation.y += delta * 0.12 * motion;
    network.group.rotation.y -= delta * 0.05 * motion;
    network.group.rotation.x = Math.sin(time * 0.2) * 0.1;
    rings.rotation.z += delta * 0.03 * motion;
    dust.rotation.y += delta * 0.015 * motion;

    // Pointer: tilt the rig and parallax the camera.
    pointerSmooth.lerp(pointerActive ? pointer : ndc.set(0, 0), ease);
    rig.rotation.x = -pointerSmooth.y * 0.25;
    rig.rotation.y = pointerSmooth.x * 0.35;
    camera.position.x = pointerSmooth.x * 0.4;
    camera.position.y = pointerSmooth.y * 0.3;
    camera.lookAt(0, 0, 0);
    halo.quaternion.copy(camera.quaternion);

    // Surface swells toward the cursor where the pointer ray meets the sphere.
    let strengthTarget = 0;
    let overSphere = false;
    if (pointerActive) {
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectSphere(hitSphere, hit)) {
        core.surface.updateWorldMatrix(true, false);
        pointerDirTarget.copy(core.surface.worldToLocal(hit)).normalize();
        strengthTarget = 1;
        overSphere = true;
      }
    }
    if (overSphere !== hovering) {
      hovering = overSphere;
      document.documentElement.style.cursor = hovering ? "pointer" : "";
    }
    core.pointer.value.lerp(pointerDirTarget, ease * 1.5).normalize();
    core.pointerStrength.value += (strengthTarget - core.pointerStrength.value) * ease;

    renderer.render(scene, camera);
  });

  return {
    dispose() {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("click", onClick);
      document.documentElement.style.cursor = "";
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
    },
  };
}
