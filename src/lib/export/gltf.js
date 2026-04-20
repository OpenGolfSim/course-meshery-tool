import { Document, NodeIO } from '@gltf-transform/core';
import { hexToRGB01 } from '../colors';

export async function write(filePath, layers, meshData) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('root');

  let materialMap = new Map();

  for (const layer of layers) {
    // const { vertices, triangles } = meshData.meshes.get(layer.id);
    const { points, triangles } = meshData.meshes.get(layer.id)?.mesh;
    
    let material = materialMap.get(layer.color);
    if (!material) {
      const c = hexToRGB01(layer.color);
      console.log('create mat', layer.color, c);
      material = doc.createMaterial(layer.color)
        .setBaseColorFactor(c)  // opaque red
        .setMetallicFactor(0)
        .setRoughnessFactor(0.8);
      materialMap.set(layer.color, material);
    }

    const positions = doc.createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array(points))
      .setBuffer(buffer);


    const indices = doc.createAccessor()
      .setType('SCALAR')
      .setArray(new Uint32Array(triangles))
      .setBuffer(buffer);

    const prim = doc.createPrimitive()
      .setAttribute('POSITION', positions)
      .setIndices(indices)
      .setMaterial(material);

    const mesh = doc.createMesh(layer.name).addPrimitive(prim);

    // stash the source polygon for this layer
    // mesh.setExtras({ polygon: layer.polygon });

    const node = doc.createNode(layer.name).setMesh(mesh);
    scene.addChild(node);
  }

  await new NodeIO().write(filePath, doc);

}

//   const doc = new Document();
//   const buffer = doc.createBuffer();
  
//   const positions = doc.createAccessor()
//     .setType('VEC3')
//     .setArray(new Float32Array(vertices))
//     .setBuffer(buffer);
  
//   const indices = doc.createAccessor()
//     .setType('SCALAR')
//     .setArray(new Uint32Array(triangles))
//     .setBuffer(buffer);
  
//   const prim = doc.createPrimitive()
//     .setAttribute('POSITION', positions)
//     .setIndices(indices);
  
//   const mesh = doc.createMesh().addPrimitive(prim);
//   const node = doc.createNode().setMesh(mesh);
//   doc.createScene().addChild(node);
  
//   // Stash your polygon source data
//   // mesh.setExtras({ polygon: originalPolygon });
  
//   await new NodeIO().write('out.glb', doc);
// }
