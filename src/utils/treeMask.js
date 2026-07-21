import * as THREE from 'three';

export const SIZE = 512;

export function positionsToMaskData(posMap, size = SIZE) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (const entry of posMap) {
    const i   = Array.isArray(entry) ? entry[0] : entry.i;
    const val = Array.isArray(entry) ? entry[1] : entry.val;
    const ci = i * 4;
    data[ci] = val;
    data[ci + 1] = val;
    data[ci + 2] = val;
    data[ci + 3] = val > 0 ? 255 : 0;
  }
  return { data, width: size, height: size };
}

export function heightmapToMesh(heightData, hmSize, worldSize, resolution = 64, yScale = 1) {
  const geo = new THREE.PlaneGeometry(worldSize, worldSize, resolution, resolution);
  geo.rotateX(-Math.PI / 2);
  geo.translate(worldSize / 2, 0, worldSize / 2); // ← this line

  const pos = geo.attributes.position;
  const step = hmSize / resolution;

  for (let iy = 0; iy <= resolution; iy++) {
    for (let ix = 0; ix <= resolution; ix++) {
      // Sample from the heightmap
      const hx = Math.min(Math.floor(ix * step), hmSize - 1);
      const hy = Math.min(Math.floor(iy * step), hmSize - 1);
      const height = heightData[hy * hmSize + hx];

      const vi = iy * (resolution + 1) + ix;
      pos.setY(vi, (height / 65535) * yScale);
    }
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
  // mesh.raycast = function() {};
  // mesh.layers.disable(0);
  return mesh;
}