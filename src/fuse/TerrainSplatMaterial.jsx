import * as THREE from 'three/webgpu';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { texture, uv, vec2, vec3, vec4, float, int, mix, smoothstep } from 'three/tsl';
import { positionWorld } from 'three/tsl';

export class TerrainSplatMaterial {
  material;

  constructor(palette, textureArray, sdfData = null) {
    this.material = new MeshStandardNodeMaterial({
      metalness: 0,
      roughness: 0.9,
    });

    const baseUV = uv();
    const flippedUV = vec2(baseUV.x, float(1.0).sub(baseUV.y));

    const tileSize = float(2.0);
    const tiledUV = positionWorld.xz.div(tileSize);

    if (!sdfData) {
      // Fallback: flat gray
      this.material.colorNode = vec3(0.5, 0.5, 0.5);
      return;
    }

    // Create SDF textures — linear filtering for smooth edges
    const sdfTextures = sdfData.textures.map(imgData => {
      const tex = new THREE.DataTexture(
        imgData.data,
        imgData.width,
        imgData.height,
        THREE.RGBAFormat
      );
      tex.needsUpdate = true;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.NoColorSpace;
      return tex;
    });

    // Read all SDF channels and decode signed distance
    // Encoding: 0 = far outside, 128 = edge, 255 = far inside
    // Decode to approximately [-1, 1] where positive = inside
    const channelAccessors = ['r', 'g', 'b', 'a'];
    const distances = [];

    for (let i = 0; i <= sdfData.maxId; i++) {
      const texIdx = Math.floor(i / 4);
      const channel = channelAccessors[i % 4];
      if (texIdx < sdfTextures.length) {
        const sdfSample = texture(sdfTextures[texIdx], flippedUV);
        distances.push(sdfSample[channel].sub(0.5).mul(2.0));
      } else {
        distances.push(float(-1.0)); // not present = far outside
      }
    }

    // Find primary (most inside) and secondary (runner-up)
    let primaryDist = distances[0];
    let primaryId = int(0);
    let secondaryDist = float(-2.0);
    let secondaryId = int(0);

    for (let i = 1; i < distances.length; i++) {
      const d = distances[i];
      const isNewPrimary = d.greaterThan(primaryDist);
      const isNewSecondary = d.greaterThan(secondaryDist);

      // When new primary: old primary becomes secondary
      // When not primary but beats secondary: becomes secondary
      const nextSecondaryDist = isNewPrimary.select(primaryDist, isNewSecondary.select(d, secondaryDist));
      const nextSecondaryId = isNewPrimary.select(primaryId, isNewSecondary.select(int(i), secondaryId));
      const nextPrimaryDist = isNewPrimary.select(d, primaryDist);
      const nextPrimaryId = isNewPrimary.select(int(i), primaryId);

      primaryDist = nextPrimaryDist;
      primaryId = nextPrimaryId;
      secondaryDist = nextSecondaryDist;
      secondaryId = nextSecondaryId;
    }

    // Fetch detail textures for the two competing surfaces
    const primaryTex = texture(textureArray, tiledUV);
    primaryTex.depthNode = float(primaryId);

    const secondaryTex = texture(textureArray, tiledUV);
    secondaryTex.depthNode = float(secondaryId);

    // Blend: smooth transition centered on the edge (primaryDist = 0)
    const blendWidth = float(0.15);
    const blend = smoothstep(blendWidth.negate(), blendWidth, primaryDist);

    this.material.colorNode = mix(secondaryTex, primaryTex, blend);
  }

  dispose() {
    this.material.dispose();
  }
}