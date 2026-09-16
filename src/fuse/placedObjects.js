import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { yieldToMain } from './utils'; // adjust to wherever yieldToMain lives in CourseScene's imports

function applyObjectTransform(group, objDef) {
  group.position.fromArray(objDef.position);
  const s = typeof objDef.scale === 'number' ? objDef.scale : 1;
  const scale = Array.isArray(objDef.scale) ? objDef.scale : [s, s, s];
  group.scale.set(scale[0], scale[1], scale[2]);
  if (objDef.rotation?.length) {
    group.rotation.set(
      THREE.MathUtils.degToRad(objDef.rotation[0]),
      THREE.MathUtils.degToRad(objDef.rotation[1]),
      THREE.MathUtils.degToRad(objDef.rotation[2]),
    );
  }
  if (!group.matrixAutoUpdate) group.updateMatrix();
}

/**
 * Loads placed-object GLBs into the scene and keeps their transforms in
 * sync with project state.
 *
 * - Load/unload (disk I/O, dispose) runs only when the set of objects
 *   changes (id/url), not on transform edits.
 * - Position/rotation/scale edits are applied in place, then bump
 *   surfaceVersion so the (debounced) lightmap bake picks them up.
 *
 * @param {object} sceneRef        ref holding { scene, meshLoader, ... }
 * @param {Array}  objects         project.objects
 * @param {boolean} rendererReady
 * @param {Function} setSurfaceVersion
 */
export function usePlacedObjects(sceneRef, objects, rendererReady, setSurfaceVersion) {
  const groupsRef = useRef(new Map()); // id -> THREE.Group

  // Changes only on add/remove/url change — not on transform edits.
  const objectKeys = useMemo(
    () => (objects ?? []).map(o => `${o.id}:${o.url}`).join('|'),
    [objects],
  );

  // Latest objects, readable by the load effect without depending on it.
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  // ─── Load/unload (expensive) ──────────────────────────────────────
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx?.meshLoader || !rendererReady) return;
    const { scene, meshLoader } = ctx;
    const defs = objectsRef.current;
    if (!defs?.length) return;

    let cancelled = false;
    (async () => {
      for (const objDef of defs) {
        const group = await meshLoader.load(objDef.url);
        if (cancelled) return;
        group.name = objDef.id;
        scene.add(group);
        groupsRef.current.set(objDef.id, group);
        // Use the freshest def in case a transform edit landed mid-load.
        const latest = objectsRef.current?.find(o => o.id === objDef.id) ?? objDef;
        applyObjectTransform(group, latest);
        await yieldToMain();
      }
      if (!cancelled) setSurfaceVersion(v => v + 1);
    })();

    return () => {
      cancelled = true;
      for (const group of groupsRef.current.values()) {
        scene.remove(group);
        group.traverse((child) => {
          if (child.isMesh) {
            child.geometry?.dispose();
            child.material?.dispose();
          }
        });
      }
      groupsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectKeys, rendererReady]);

  // ─── Transforms (cheap, every edit) ───────────────────────────────
  useEffect(() => {
    if (!objects?.length) return;
    let changed = false;
    for (const objDef of objects) {
      const group = groupsRef.current.get(objDef.id);
      if (!group) continue; // still loading — load effect applies it
      applyObjectTransform(group, objDef);
      changed = true;
    }
    if (changed) setSurfaceVersion(v => v + 1); // bake effect debounces
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects]);
}