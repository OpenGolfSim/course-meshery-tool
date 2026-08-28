import * as THREE from 'three/webgpu';
import { EXRLoader, GroundedSkybox } from 'three/examples/jsm/Addons.js';

export class SkyBox {
  exrLoader;
  texture = null;
  skybox = null;
  scene = null;
  rotationDeg = 0;
  constructor() {
    this.exrLoader = new EXRLoader();
    this.exrLoader.setDataType(THREE.HalfFloatType);
  }

  async load(scene, exrBuffer, options = {}) {
    this.dispose();
    this.scene = scene;

    const texture = this.exrLoader.createDataTexture(exrBuffer);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.needsUpdate = true;
    this.texture = texture;

    const {
      grounded = true,
      height = 10,
      radius = 1000,
      floorOffset = Math.max(1, radius / 2500),  // ≥1m; ~2m at radius 5000
      center = { x: 0, z: 0 },
    } = options;

    if (grounded) {
      // this.skybox = new GroundedSkybox(texture, height, radius);
      // this.skybox.position.set(center.x, height - floorOffset, center.z);
      // const mat = this.skybox.material;
      // mat.depthWrite = false;
      // this.skybox.renderOrder = -1;   // draw first; terrain draws over it
      // scene.add(this.skybox);
      this.buildProjection({ height, radius, floorOffset, center });
    } else {
      scene.background = texture;
    }

    scene.environment = texture;
    this.setRotation(options.rotation ?? 0);
    this.setIntensity(options.intensity ?? 1);
  }


  // Rebuild only the projection mesh — reuses the already-decoded texture.
  // Safe to call on height/radius changes; no EXR fetch or decode.
  buildProjection(options = {}) {
    if (!this.scene || !this.texture) return;
    const {
      height = 10,
      radius = 1000,
      floorOffset = Math.max(1, radius / 2500),
      center = { x: 0, z: 0 },
    } = options;

    if (this.skybox) {
      this.skybox.removeFromParent();
      this.skybox.geometry.dispose();
      (this.skybox.material).dispose();
    }
    this.skybox = new GroundedSkybox(this.texture, height, radius);
    this.skybox.position.set(center.x, height - floorOffset, center.z);
    this.skybox.rotation.y = THREE.MathUtils.degToRad(this.rotationDeg);
    const mat = this.skybox.material;
    mat.depthWrite = false;
    this.skybox.renderOrder = -1;   // draw first; terrain draws over it
    this.scene.add(this.skybox);
  }  

  // Cheap runtime updates — safe to call per-keystroke from the editor
  setRotation(degrees) {
    this.rotationDeg = degrees;
    const rad = THREE.MathUtils.degToRad(degrees);
    if (this.skybox) this.skybox.rotation.y = rad;
    if (this.scene) {
      this.scene.environmentRotation.y = rad;
      this.scene.backgroundRotation.y = rad;
    }
  }

  setIntensity(intensity) {
    if (this.scene) {
      this.scene.environmentIntensity = intensity;
      this.scene.backgroundIntensity = intensity;
    }
  }

  dispose() {
    if (this.skybox) {
      this.skybox.removeFromParent();
      this.skybox.geometry.dispose();
      (this.skybox.material).dispose();
      this.skybox = null;
    }
    if (this.scene) {
      if (this.scene.background === this.texture) this.scene.background = null;
      if (this.scene.environment === this.texture) this.scene.environment = null;
    }
    this.texture?.dispose();
    this.texture = null;
    this.scene = null;
  }
}