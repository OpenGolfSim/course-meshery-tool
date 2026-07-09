// src/terrain/TerrainMesh.js
import * as THREE from 'three/webgpu';

export class TerrainMesh {
  mesh;

  constructor(heightMap, heightScale, size = 1000, maxSegments = 1024, material = null) {
    const resolution = Math.sqrt(heightMap.length);
    const segments = Math.min(resolution - 1, maxSegments);
    const step = resolution / (segments + 1);
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let z = 0; z <= segments; z++) {
      for (let x = 0; x <= segments; x++) {
        const srcX = Math.round(x * step);
        const srcZ = Math.round(z * step);
        pos.setY(
          z * (segments + 1) + x,
          heightMap[srcZ * resolution + srcX] / 65535 * heightScale
        );
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const mat = material || new THREE.MeshStandardNodeMaterial({ color: '#909380' });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'terrain';
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}