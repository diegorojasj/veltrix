import * as THREE from "three";

// Palette — authored in sRGB, converted to linear by THREE.Color.
export const palette = {
  deep: new THREE.Color("#0b0b3b"),
  blue: new THREE.Color("#3b5bff"),
  violet: new THREE.Color("#8b3dff"),
  cyan: new THREE.Color("#5ee7ff"),
  white: new THREE.Color("#e9e6ff"),
};

// Uniform objects shared by reference across every material, so one write per frame updates all.
export interface SharedUniforms {
  uTime: THREE.IUniform<number>;
  uReveal: THREE.IUniform<number>;
  uPixelRatio: THREE.IUniform<number>;
}

export function createSharedUniforms(): SharedUniforms {
  return {
    uTime: { value: 0 },
    uReveal: { value: 0 },
    uPixelRatio: { value: 1 },
  };
}
