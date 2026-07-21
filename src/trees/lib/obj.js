import fs from "node:fs";
import path from "node:path";

const materialCache = new Map();


export function addOBJ(doc, objPath, lodNode, name, buffer) {
  // const objDir = path.dirname(path.resolve(objFiles[i]));
  const objDir = path.dirname(path.resolve(objPath));
  const obj = parseOBJ(fs.readFileSync(objPath, "utf-8"));
  
  console.log(`${name}: ${objPath}`);

  // Load MTL
  let mtlMats = new Map();
  if (obj.mtllib) {
    const mtlPath = path.join(objDir, obj.mtllib);
    if (fs.existsSync(mtlPath)) mtlMats = parseMTL(fs.readFileSync(mtlPath, "utf-8"));
    else console.warn(`  ⚠ MTL not found: ${mtlPath}`);
  }
  const mesh = doc.createMesh(name);

  for (const g of obj.groups) {
    // Material (shared across LODs by name)
    let material = materialCache.get(g.material);
    if (!material) {
      material = doc.createMaterial(g.material);
      const mtl = mtlMats.get(g.material);
      if (mtl) {
        material.setBaseColorFactor([...mtl.color, mtl.opacity]);
        // const diffuse = loadTexture(doc, mtl.diffuseMap && path.resolve(objDir, mtl.diffuseMap));
        // if (diffuse) material.setBaseColorTexture(diffuse);
        // const normal = loadTexture(doc, mtl.normalMap && path.resolve(objDir, mtl.normalMap));
        // if (normal) material.setNormalTexture(normal);
        // if (mtl.opacity < 1 || mtl.opacityMap) material.setAlphaMode("MASK").setAlphaCutoff(0.33);
        const diffuse = loadTexture(doc, mtl.diffuseMap && path.resolve(objDir, mtl.diffuseMap));
        if (diffuse) {
          material.setBaseColorTexture(diffuse);
          material.setBaseColorFactor([1, 1, 1, mtl.opacity]); // texture has full color already
          material.setAlphaMode("MASK").setAlphaCutoff(0.33).setDoubleSided(true);
        }
        material.setMetallicFactor(0).setRoughnessFactor(0.8);
        const normal = loadTexture(doc, mtl.normalMap && path.resolve(objDir, mtl.normalMap));
        if (normal) material.setNormalTexture(normal);
      }
      materialCache.set(g.material, material);
    }

    const prim = doc.createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(g.positions)).setBuffer(buffer))
      .setAttribute("NORMAL",   doc.createAccessor().setType("VEC3").setArray(new Float32Array(g.normals)).setBuffer(buffer))
      .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(g.uvs)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(g.indices)).setBuffer(buffer))
      .setMaterial(material);
    mesh.addPrimitive(prim);
  }

  const tris = obj.groups.reduce((s, g) => s + g.indices.length / 3, 0);
  console.log(`  ✓ ${tris} tris, ${obj.groups.length} material(s)`);
  
  // const lodMesh = doc.createMesh(name);
  lodNode.setMesh(mesh);

  // root.addChild(doc.createNode(name).setMesh(mesh).setExtras({ lod_level: i }));
}

function parseOBJ(source) {
  const positions = [], normals = [], uvs = [];
  let mtllib = null;
  let currentMat = "_default";
  const groups = new Map();

  function group(mat) {
    if (!groups.has(mat))
      groups.set(mat, { material: mat, positions: [], normals: [], uvs: [], indices: [], vertexMap: new Map() });
    return groups.get(mat);
  }

  for (const line of source.split("\n")) {
    const p = line.trim().split(/\s+/);
    switch (p[0]) {
      case "mtllib": mtllib = p.slice(1).join(" "); break;
      case "v":      positions.push(p.slice(1, 4).map(Number)); break;
      case "vn":     normals.push(p.slice(1, 4).map(Number)); break;
      case "vt":     uvs.push([Number(p[1]), 1 - Number(p[2])]); break; // flip V for glTF

      case "usemtl": currentMat = p.slice(1).join(" "); break;
      case "f": {
        const g = group(currentMat);
        const verts = p.slice(1).map((f) => {
          if (g.vertexMap.has(f)) return g.vertexMap.get(f);
          const [vi, ti, ni] = f.split("/").map((s) => (s ? parseInt(s) : 0));
          const idx = g.positions.length / 3;
          g.positions.push(...(positions[vi - 1] || [0, 0, 0]));
          g.normals.push(...(ni ? normals[ni - 1] : [0, 1, 0]));
          g.uvs.push(...(ti ? uvs[ti - 1] : [0, 0]));
          g.vertexMap.set(f, idx);
          return idx;
        });
        for (let i = 1; i < verts.length - 1; i++)
          g.indices.push(verts[0], verts[i], verts[i + 1]);
        break;
      }
    }
  }
  return { mtllib, groups: [...groups.values()].filter((g) => g.indices.length > 0) };
}

// ── MTL parser ────────────────────────────────────────────────────────────────

function parseMTL(source) {
  const mats = new Map();
  let cur = null;
  for (const line of source.split("\n")) {
    const p = line.trim().split(/\s+/);
    switch (p[0]?.toLowerCase()) {
      case "newmtl":
        cur = { diffuseMap: null, normalMap: null, opacityMap: null, color: [1,1,1], opacity: 1 };
        mats.set(p.slice(1).join(" "), cur);
        break;
      case "map_kd":
        if (cur) cur.diffuseMap = p.slice(1).join(" ");
        break;
      case "map_bump":
      case "bump":
        if (cur) cur.normalMap = p.slice(1).filter((s) => isNaN(s) && !s.startsWith("-")).join(" ");
        break;
      case "map_d":
        if (cur) cur.opacityMap = p.slice(1).join(" ");
        break;

      case "kd":       if (cur) cur.color = p.slice(1, 4).map(Number); break;
      case "d":        if (cur) cur.opacity = Number(p[1]); break;
    }
  }
  return mats;
}

// ── Texture cache (deduplicates across LODs by absolute path) ─────────────────

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".tga": "image/x-tga", ".webp": "image/webp" };
const texCache = new Map();

function loadTexture(doc, texPath) {
  if (!texPath || !fs.existsSync(texPath)) {
    if (texPath) console.warn(`  ⚠ texture not found: ${texPath}`);
    return null;
  }
  const abs = path.resolve(texPath);
  if (texCache.has(abs)) return texCache.get(abs);
  const ext = path.extname(abs).toLowerCase();
  const tex = doc.createTexture(path.basename(abs, ext))
    .setImage(new Uint8Array(fs.readFileSync(abs)))
    .setMimeType(MIME[ext] || "application/octet-stream");
  texCache.set(abs, tex);
  console.log(`  📦 texture: ${path.basename(abs)}`);
  return tex;
}