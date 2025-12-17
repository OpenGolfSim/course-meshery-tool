export function addVertexColorsToOBJ(objData, colorMap) {
  const lines = objData.split('\n');
  let currentMesh = "";
  let vertexIndex = 0;
  let meshVertexIndex = 0; // Tracks per-mesh v index
  let outputLines = [];
  let currentVertexColors = null;

  for (let line of lines) {
    if (/^(o |g )/.test(line)) {
      // New mesh/group
      // Extract mesh name after "o " or "g "
      currentMesh = line.substr(2).trim();
      currentVertexColors = colorMap[currentMesh] || null;
      meshVertexIndex = 0;
      outputLines.push(line);
    } else if (line.startsWith("v ")) {
      let output = line;
      if (currentVertexColors && meshVertexIndex * 3 + 2 < currentVertexColors.length) {
        const idx = meshVertexIndex * 3;
        const r = currentVertexColors[idx];
        const g = currentVertexColors[idx + 1];
        const b = currentVertexColors[idx + 2];
        output += ` ${r} ${g} ${b}`;
      }
      meshVertexIndex++;
      vertexIndex++;
      outputLines.push(output);
    } else {
      outputLines.push(line);
    }
  }
  return outputLines.join('\n');


  // fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf8');
}
