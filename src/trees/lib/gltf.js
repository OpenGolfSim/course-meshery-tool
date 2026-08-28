import { mergeDocuments, flatten, prune, dedup, transformMesh } from '@gltf-transform/functions';

// export async function addGLB(doc, glbPath, lodNode, name, io) {
  // const src = await io.read(glbPath);
export async function addGLB(doc, glbSource, lodNode, name, io) {
  // glbSource: file path (string) or in-memory GLB (Uint8Array)
  const src = (glbSource instanceof Uint8Array)
    ? await io.readBinary(glbSource)
    : await io.read(glbSource);
  // Bake node transforms into mesh data so geometry lives in identity space,
  // matching how your OBJ path emits it. (Blender's +Y-up export usually leaves
  // transforms at identity, but this makes it bulletproof.)
  await src.transform(flatten());
  for (const scene of src.getRoot().listScenes()) {
    for (const node of scene.listChildren()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      transformMesh(mesh, node.getMatrix());
      node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }
  }
  // Merge brings in all meshes/materials/textures/accessors as NEW props in `doc`.
  // Snapshot first so we can find exactly what got added (version-robust; doesn't
  // rely on mergeDocuments' return value).
  const before = new Set(doc.getRoot().listMeshes());
  const beforeScenes = new Set(doc.getRoot().listScenes());
  mergeDocuments(doc, src);
  const addedMeshes  = doc.getRoot().listMeshes().filter((m) => !before.has(m));
  const addedScenes  = doc.getRoot().listScenes().filter((s) => !beforeScenes.has(s));

  // Consolidate every merged primitive onto one LOD mesh (your game's structure).
  const lodMesh = doc.createMesh(name);
  for (const m of addedMeshes) {
    for (const prim of m.listPrimitives()) {
      m.removePrimitive(prim);     // primitive keeps its material + textures + COLOR_0
      lodMesh.addPrimitive(prim);
    }
  }
  lodNode.setMesh(lodMesh);

  // Drop the source's own scenes/nodes; they're now orphaned. prune() cleans the rest.
  addedScenes.forEach((s) => s.dispose());
}