import fs from 'fs';

export async function write(filePath, layers, meshData) {
  const lines = ['# Generated from SVG layers'];
  let vertexOffset = 0;

  for (const layer of layers) {
    lines.push(`o ${layer.name || 'layer'}`);

    // write this layer's vertices
    const { points, triangles } = meshData.meshes.get(layer.id)?.mesh;
    for (let i = 0; i < points.length; i += 3) {
      lines.push(
        `v ${points[i].toFixed(6)} ${points[i+1].toFixed(6)} ${points[i+2].toFixed(6)}`
      );
    }

    // write faces, shifted by accumulated offset, +1 for 1-based indexing
    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i]     + vertexOffset + 1;
      const b = triangles[i + 1] + vertexOffset + 1;
      const c = triangles[i + 2] + vertexOffset + 1;
      lines.push(`f ${a} ${b} ${c}`);
    }

    vertexOffset += points.length / 3;
  }


  await fs.promises.writeFile(filePath, lines.join('\n'));

}
//   const lines = [];

//   // vertices: flat array [x,y,z, x,y,z, ...] or array of [x,y,z]
//   for (let i = 0; i < vertices.length; i += 3) {
//     lines.push(`v ${vertices[i]} ${vertices[i+1]} ${vertices[i+2]}`);
//   }

//   // triangles: flat array of indices, 3 per face
//   // NOTE: OBJ indices are 1-based, not 0-based
//   for (let i = 0; i < triangles.length; i += 3) {
//     lines.push(`f ${triangles[i]+1} ${triangles[i+1]+1} ${triangles[i+2]+1}`);
//   }

//   const data = lines.join('\n');
//   await fs.promises.writeFile(filePath, data);
// }
