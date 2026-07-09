import { TreePlanter } from '@opengolfsim/fuse';
import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree, useLoader, useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader';
import { positionsToMaskData, heightmapToMesh } from '../utils/treeMask';
import { RESOURCES_FILE_PROTOCOL } from '../constants.js';

// const TRANSCODER_PATH = 'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets/basis/';
const TRANSCODER_PATH = `${RESOURCES_FILE_PROTOCOL}://basis/`;

function loadTree(tree) {
  const treeGroup = new THREE.Group();
  tree.scale.set(1, 1, 1);
  tree.updateMatrixWorld(true);

  // Find the node that contains the LOD groups
  let lodParent = null;
  tree.traverse((child) => {
    if (child.children.some(c => c.userData?.lod_level !== undefined || c.name.match(/^LOD\d+$/))) {
      lodParent = child;
    }
  });

  const dump = (m) => ({
    color: m.color?.getHexString(),
    metalness: m.metalness,
    roughness: m.roughness,
    map: !!m.map,
    normalMap: !!m.normalMap,
    aoMap: !!m.aoMap,
    aoMapIntensity: m.aoMapIntensity,
    emissive: m.emissive?.getHexString(),
  });


  if (lodParent) {
    // Multi-LOD tree
    for (const lodNode of lodParent.children) {
      const level = lodNode.userData?.lod_level ?? parseInt(lodNode.name.match(/LOD(\d+)/i)?.[1] ?? '0');

      if (lodNode instanceof THREE.Mesh) {
        const mesh = lodNode.clone();
        lodNode.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
        mesh.userData.lod = level;
        console.log("-DUMP-", tree.name, mesh.material);
        // console.log("-DUMP-", tree.name, dump(mesh.material));
        // mesh.material.color = new THREE.Color('#ffffff');
        // const m = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
        // const mat = mesh.material.clone();
        // m.normalMap = null;
        // mesh.material.color = new THREE.Color(1.3, 1.3, 1.3);
        // mesh.material.normalMap = null;
        // mesh.material.side = THREE.DoubleSide;
        // mesh.material.needsUpdate = true;
        // mesh.material = mat;
        treeGroup.add(mesh);
      } else {
        lodNode.traverse((child) => {
          if (child instanceof THREE.Mesh && child.isMesh) {
            const mesh = child.clone();
            child.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
            mesh.userData.lod = level;
            console.log("-DUMP-", tree.name, mesh.material);
            // const m = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
            // // mesh.material.color = new THREE.Color(1.3, 1.3, 1.3);
            // mesh.material = m;
            treeGroup.add(mesh);
          }
        });
      }
    }
  } else {
    // Single mesh, no LODs — treat everything as LOD0
    tree.traverse((child) => {
      if (child instanceof THREE.Mesh && child.isMesh) {
        const mesh = child.clone();
        child.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
        mesh.userData.lod = 0;
        treeGroup.add(mesh);
      }
    });
  }

  console.log(`loadTree: ${treeGroup.children.length} meshes — LODs: ${[...new Set(treeGroup.children.map(c => c.userData.lod))].sort().join(', ')}`);

  // Center at origin
  const box = new THREE.Box3().setFromObject(treeGroup);
  const center = box.getCenter(new THREE.Vector3());
  treeGroup.children.forEach((child) => {
    child.position.x -= center.x;
    child.position.z -= center.z;
    child.position.y -= Math.max(0, box.min.y);  // only shift DOWN if model floats above origin
  });

  return treeGroup;
}



function flattenGLTF(gltfScene) {
  // const loaded = TreePlanter.loadTree(gltfScene.scene);
  // console.log('flatten-loaded', loaded);
  // return loaded;
  
  console.log('flatten-scene', gltfScene);
  let group;

  gltfScene.scene.traverse((child) => {
    if (child.userData?.lod_count) {
      // console.log(`child: ${child.name}`, child);
      // group = TreePlanter.loadTree(child);
      // console.log(`group: ${child.name}`, group);
      group = child;
    }
    // if (loaded) {
    //   group = loaded;
    // }
    // if (!child.isMesh) return;
    // const mesh = child.clone();
    // group = TreePlanter.loadTree(child);
    // child.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
    // group.add(mesh);
  });
  if (!group) {
    gltfScene.scene.traverse((child) => {
      if (!child.isMesh) return;
      group = child;
      // const mesh = child.clone();
      // child.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
      // group.add(mesh);
    });
  }
  if (group) {
    console.log('selected group', group);
    return loadTree(group);
  }
  return new THREE.Group();
}

export function TreePreview({ worldSize, groundRef, heightMap, heightScale, positions, trees, seed = 12345 }) {
  // const scene = useThree((s) => s.scene);
  const { scene, gl } = useThree();

  const planterRef = useRef(null);

  // Load all models in one suspended call
  const urls = useMemo(() => (trees || []).map((t) => t.url), [trees]);
  // const gltfs = useLoader(GLTFLoader, urls);
  const gltfs = useLoader(GLTFLoader, urls, (loader) => {
    const ktx2Loader = new KTX2Loader().setTranscoderPath(TRANSCODER_PATH).detectSupport(gl);
    loader.setKTX2Loader(ktx2Loader);
  });

  const resolvedTrees = useMemo(() => {
    return (trees || []).map((t, i) => ({
      ...t,
      lodDistances: [80, 160],
      meshGroup: flattenGLTF(gltfs[i]),
    }));
  }, [trees, gltfs]);

  useFrame((state) => {
    if (state.camera) {
      planterRef.current?.update(state.camera);
    }
  }, []);
  
  useEffect(() => {
    if (!heightMap?.data || !positions?.length || !resolvedTrees.length) return;
    const maskData = positionsToMaskData(positions);
    
    const groundMesh = heightmapToMesh(heightMap.data, heightMap.size, worldSize, 64, heightScale ?? 10);
    scene.add(groundMesh);

    console.log('resolvedTrees', resolvedTrees);
    console.log('groundRef?.current', groundMesh);
    console.log('maskData', maskData);
    console.log('seed', seed);
    const planter = new TreePlanter({
      scene,
      worldSize,
      groundMeshes: groundMesh
      // groundMeshes: groundRef?.current ?? [],
    });
    planterRef.current = planter;
    planter.plantFromMask(resolvedTrees, maskData, seed);
    console.log('plant!', planter);
    
    // disable R3F pointer raycasting on all tree meshes
    planter.treeGroup.traverse((child) => {
      if (child.isMesh) child.raycast = () => {};
    });    
    // groundMesh.layers.disable(0);
    scene.remove(groundMesh); // done raycasting, remove it
    groundMesh.geometry.dispose();
    groundMesh.material.dispose();
    
    // // match the terrain offset
    // const offset = worldSize / 2;
    // planter.treeGroup.position.set(-offset, 0, -offset);

    return () => {
      console.log('remove me');
      planter.clear();
      planter.treeGroup.traverse((child) => {
        if (child.isMesh) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });

      // if (groundMesh) {
      //   scene.remove(groundMesh);
      // }
      scene.remove(planter.treeGroup);
    };
  }, [scene, worldSize, positions, resolvedTrees, seed, heightMap]);

  return null;
}

export default React.memo(TreePreview);
