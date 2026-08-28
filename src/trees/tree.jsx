import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import MesheryTheme from '../theme/MesheryTheme.jsx';
import { Avatar, Box, Button, CircularProgress, Grid, List, ListItem, ListItemAvatar, ListItemText, Stack, TextField, Typography } from '@mui/material';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Canvas, useThree, useLoader } from '@react-three/fiber';
import { Line, Text } from '@react-three/drei';
import { CourseLight } from '@opengolfsim/fuse';
import NumberField from '../components/NumberField.jsx';

const IMPOSTOR_GRID = 4;    // 4×4 views over the upper hemisphere
const IMPOSTOR_FRAME = 256; // 4 × 256 = 1024px atlas, matches TREE_TEXTURE_SIZE
const IMPOSTOR_SS = 4;      // supersample: render views at 4× and downscale

// Grid cell → view direction. Center of atlas = straight down (top view),
// edges = horizon views. Runtime shader must implement the exact inverse.
function hemiOctaDir(u, v) {
  const gx = u * 2 - 1, gy = v * 2 - 1;
  const x = (gx + gy) * 0.5;
  const z = (gx - gy) * 0.5;
  const y = 1 - Math.abs(x) - Math.abs(z);
  return new THREE.Vector3(x, y, z).normalize();
}

function captureAtlas(renderer, scene, sphere) {
  const N = IMPOSTOR_GRID, F = IMPOSTOR_FRAME;
  const atlas = document.createElement('canvas');
  atlas.width = atlas.height = N * F;
  const ctx = atlas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const { center, radius: r } = sphere;

  const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.1, r * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const dir = hemiOctaDir(i / (N - 1), j / (N - 1));
      cam.position.copy(center).addScaledVector(dir, r * 2);
      cam.up.set(0, 1, 0);
      if (Math.abs(dir.y) > 0.99) cam.up.set(0, 0, -1); // top view: world-up is degenerate
      cam.lookAt(center);
      cam.updateProjectionMatrix();
      renderer.render(scene, cam);
      // v grows upward in UV space; canvas y grows downward → flip row placement
      // ctx.drawImage(renderer.domElement, i * F, (N - 1 - j) * F, F, F);
      ctx.drawImage(renderer.domElement, i * F, (N - 1 - j) * F, F, F); // scales SS×F → F
    }
  }
  dilateAtlas(atlas);
  const tex = new THREE.CanvasTexture(atlas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Bleed edge colors into transparent texels so mipmaps and block compression
// average leaf color instead of the black clear color (kills dark halos/splotches).
// Alpha is left untouched — coverage doesn't grow, only RGB.
function dilateAtlas(canvas, iterations = 16) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;
  let mask = new Uint8Array(n);
  for (let p = 0; p < n; p++) mask[p] = d[p * 4 + 3] >= 8 ? 1 : 0;

  for (let it = 0; it < iterations; it++) {
    const next = mask.slice();
    let changed = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (mask[p]) continue;
        let r = 0, g = 0, b = 0, cnt = 0;
        if (x > 0 && mask[p - 1])         { const q = (p - 1) * 4; r += d[q]; g += d[q + 1]; b += d[q + 2]; cnt++; }
        if (x < w - 1 && mask[p + 1])     { const q = (p + 1) * 4; r += d[q]; g += d[q + 1]; b += d[q + 2]; cnt++; }
        if (y > 0 && mask[p - w])         { const q = (p - w) * 4; r += d[q]; g += d[q + 1]; b += d[q + 2]; cnt++; }
        if (y < h - 1 && mask[p + w])     { const q = (p + w) * 4; r += d[q]; g += d[q + 1]; b += d[q + 2]; cnt++; }
        if (cnt === 0) continue;
        const q = p * 4;
        d[q] = r / cnt; d[q + 1] = g / cnt; d[q + 2] = b / cnt;
        next[p] = 1;
        changed = true;
      }
    }
    mask = next;
    if (!changed) break;
  }
  ctx.putImageData(img, 0, 0);
}

function buildImpostorQuad(sphere, atlasTex) {
  const { center, radius: r } = sphere;
  const mat = new THREE.MeshStandardMaterial({
    map: atlasTex,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  });
  // Metadata MUST live on the material: the export worker's primitive
  // consolidation (addGLB) discards nodes, but material extras survive
  // (same mechanism as the batch: 'foliage' tag).
  mat.userData.impostor = {
    grid: IMPOSTOR_GRID,
    hemi: true,
    radius: r,
    center: [center.x, center.y, center.z],
  };
  // Bake placement into vertex data (identity node transforms), as before.
  const geo = new THREE.PlaneGeometry(r * 2, r * 2);
  geo.translate(center.x, center.y, center.z);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mat));
  return group;
}
async function generateBillboardGLB(treeScene) {
  const clone = treeScene.clone(true);
  // Capture pure albedo: swap every material for an unlit equivalent that keeps
  // the color map/tint/alpha. Lighting is NOT baked into the texture — it gets
  // applied at runtime by the billboard's lit material, matching the PBR LODs.
  clone.traverse((o) => {
    if (!o.isMesh) return;
    // Keep lit materials for the bake (clone: source materials are shared
    // with the live preview and must not be mutated)
    const toCapture = (src) => {
      const m = src.clone();
      if ('roughness' in m) { m.roughness = 1; m.metalness = 0; }
      m.alphaTest = src.alphaTest || (src.transparent ? 0.5 : 0);
      m.transparent = false;
      return m;
    };
    o.material = Array.isArray(o.material) ? o.material.map(toCapture) : toCapture(o.material);

  });

  const captureScene = new THREE.Scene();
  // Direction-neutral bake lighting: hemisphere light bakes shape contrast
  // (bright canopy top, darker undersides/interior) without baking a sun
  // azimuth into the atlas. Intensity π ≈ albedo-level output for white sky.
  captureScene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 2.5));
  captureScene.add(clone);

  const box = new THREE.Box3().setFromObject(clone);

  const rt = new THREE.WebGLRenderer({ alpha: true });
  rt.setSize(IMPOSTOR_FRAME * IMPOSTOR_SS, IMPOSTOR_FRAME * IMPOSTOR_SS);
  rt.setClearColor(0x000000, 0);

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const atlas = captureAtlas(rt, captureScene, sphere);

  rt.dispose();

  const impostor = buildImpostorQuad(sphere, atlas);
  return new GLTFExporter().parseAsync(impostor, { binary: true }); // ArrayBuffer
}


function TextSprite({ text, size = 0.3, position }) {
  const { texture, aspect } = useMemo(() => {
    const px = 64;
    const canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');
    ctx.font = `${px}px sans-serif`;
    canvas.width = Math.ceil(ctx.measureText(text).width) + 8;
    canvas.height = Math.ceil(px * 1.3);
    ctx = canvas.getContext('2d'); // resizing resets state, grab fresh
    ctx.font = `${px}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 4, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    return { texture, aspect: canvas.width / canvas.height };
  }, [text]);
  
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite position={position} scale={[size * aspect, size, 1]}>
      <spriteMaterial map={texture} transparent />
    </sprite>
  );
}

function rulerExtent(height) {
  const step = height > 10 ? 5 : 1;
  const top = Math.ceil(height / step) * step;
  return { step, top };
}

function ScaleRuler({ height }) {
  const { step, top } = rulerExtent(height);

  const ticks = [];
  for (let m = 0; m <= top + 1e-6; m += step) ticks.push(m);

  const fontSize = Math.max(height * 0.035, 0.1);

  return (
    <group>
      {/* main line runs to the rounded top, not the raw height */}
      <Line points={[[0, 0, 0], [0, top, 0]]} color="white" />
      {ticks.map((m) => (
        <group key={m} position={[0, m, 0]}>
          <Line points={[[0, 0, 0], [-fontSize, 0, 0]]} color="white" />
          <TextSprite text={`${m}m`} size={fontSize} position={[-fontSize * 1.5, 0, 0]} />
        </group>
      ))}
    </group>
  );
}

function TreeScene({ lods, scale, captureRef, onSceneReady }) {
  const { gl, scene, camera } = useThree();
  const groupRef = useRef();
  const rulerRef = useRef();
  const lightRef = useRef();
  const [bounds, setBounds] = useState(null);

  const urls = useMemo(() => lods.map(l => l.uri), [lods]);
  const gltfs = useLoader(GLTFLoader, urls);

  // Frame camera around the loaded tree
  useEffect(() => {
    if (!groupRef.current?.children.length) return;

    groupRef.current.updateMatrixWorld(true); // ensure scale is applied before measuring

    const box = new THREE.Box3().setFromObject(groupRef.current);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    console.log('Setting bounds', size);
    setBounds({ x: box.min.x, y: box.min.y, z: center.z, height: size.y });

    const { top } = rulerExtent(size.y);

    const halfFov = (camera.fov * Math.PI / 180) / 2;
    const dist = Math.max(
      // size.y / (2 * Math.tan(halfFov)),           // fit height
      top / (2 * Math.tan(halfFov)),              // fit ruler height (>= tree height)
      size.x / (2 * Math.tan(halfFov * camera.aspect)) // fit width
    ) * 1.2;

    const frameY = box.min.y + top / 2;
    camera.position.set(center.x, frameY, center.z + dist);
    camera.lookAt(center.x, frameY, center.z);

    camera.updateProjectionMatrix();
  }, [gltfs, scale, camera]);

  // Expose capture to parent
  useEffect(() => {
    captureRef.current = () => {
      if (rulerRef.current) rulerRef.current.visible = false;
      gl.render(scene, camera);
      const dataUrl = gl.domElement.toDataURL('image/png');
      if (rulerRef.current) {
        rulerRef.current.visible = true;
        gl.render(scene, camera);
      }
      return dataUrl;
      // return gl.domElement.toDataURL('image/png');
    };
  }, [gl, scene, camera, captureRef]);
  
  useEffect(() => {
    if (!scene) { return; }
    if (!lightRef.current) {
      lightRef.current = new CourseLight();
      console.log('add course light');
      scene.add(lightRef.current);
    }
  }, [scene]);  

  // Tell the parent which scene is loaded (billboard source)
  useEffect(() => {
    onSceneReady?.(gltfs[0].scene);
  }, [gltfs, onSceneReady]);  

  return (
    <>
      <group ref={groupRef} scale={scale}>
        <primitive object={gltfs[0].scene} />
      </group>
      {bounds && (
        <group ref={rulerRef} position={[bounds.x - 0.5, bounds.y, bounds.z]}>
          <ScaleRuler height={bounds.height} />
        </group>
      )}
    </>
  );
}


function TreeListItem(props) {
  return (
    <ListItem
      sx={{ pr: '90px' }}
      secondaryAction={props.action}
    >
      <ListItemAvatar><Avatar>{props.avatar}</Avatar></ListItemAvatar>
      <ListItemText
        primaryTypographyProps={{ noWrap: true }}
        secondaryTypographyProps={{ noWrap: true }}
        sx={{
          overflow: 'hidden', // 4. Essential for ellipsis to work correctly
          minWidth: 0,        // 5. Prevents flex items from stretching uncontrollably
        }}
        {...props.text}
      />
    </ListItem>
  )
}
function TreeMaker() {
  const [lodObj, setLODObj] = useState({});
  const [isExporting, setIsExporting] = useState(false);
  const [treeName, setTreeName] = useState('Custom Tree');
  const [treeScale, setTreeScale] = useState(1);
  
  const lods = useMemo(() => {
    return Object.values(lodObj);
  }, [lodObj]);

  // const [thumbnailImage, setThumbnailImage] = useState();
  const captureRef = useRef(null);

  const [treeScene, setTreeScene] = useState(null);
  const [billboardGlb, setBillboardGlb] = useState(null);   // ArrayBuffer
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateBillboard = async () => {
    setIsGenerating(true);
    try {
      const glb = await generateBillboardGLB(treeScene);
      setBillboardGlb(glb);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    const dataUrl = captureRef.current?.();
    console.log('response', dataUrl);
    const response = await window.trees.export({
      thumbnail: dataUrl,
      name: treeName,
      scale: treeScale,
      billboard: billboardGlb
    });
    console.log('response', response);
    setIsExporting(false);
  }, [treeScale, treeName, billboardGlb]);

  // allows the user to select a tree from disk
  const handleSelect = async (lodNum) => {
    const updatedLods = await window.trees.selectTree(lodNum);
    setLODObj(updatedLods);
  };

  // sync from server-side list
  useEffect(() => {
    window.trees.getTrees().then(updatedLods => {
      setLODObj(updatedLods);
    });
  }, []);

  // a generated billboard is stale if the source models change
  useEffect(() => {
    setBillboardGlb(null);
  }, [lodObj]);  

  if (isExporting) {
    return (
      <Stack spacing={3} sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
        <Typography color="textSecondary">Exporting...</Typography>
      </Stack>
    );
  }
  return (
    <Grid container={true} sx={{ height: '100vh' }}>
      <Grid sx={{ width: 320 }}>

        <Stack spacing={3} sx={{ p: 3 }}>
          <TextField
            fullWidth
            label="Tree Name"
            value={treeName}
            onChange={(e) => setTreeName(e.target.value)}
          />
          <NumberField
            fullWidth
            label="Scale"
            value={treeScale}
            step={0.01}
            min={0.01}
            max={20}
            onChange={(v) => setTreeScale(v)}
          />
        </Stack>
        <List>
          <TreeListItem
            action={
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant={billboardGlb ? 'text' : 'contained'}
                  disabled={!treeScene || isGenerating || !lods?.length}
                  onClick={handleGenerateBillboard}
                >
                  {isGenerating ? 'Generating...' : billboardGlb ? 'Regenerate' : 'Generate'}
                </Button>
                {/* <Button
                  variant={lodObj?.[3] ? 'text' : 'contained'}
                  color={lodObj?.[3] ? 'inherit' : 'primary'}
                  onClick={() => handleSelect(3)} size="small"
                >
                  {lodObj?.[3] ? 'Change' : 'Select'}
                </Button> */}
              </Stack>

            }
            avatar={'B'}
            text={{
              primary: 'LOD3 (Billboard)',
              secondary: lodObj?.[3]?.name ?? (billboardGlb ? 'Auto-generated' : ''),
            }}
          />
          <TreeListItem
            action={
              <Button
                variant={lodObj?.[2] ? 'text' : 'contained'}
                color={lodObj?.[2] ? 'inherit' : 'primary'}
                onClick={() => handleSelect(2)} size="small"
              >
                  {lodObj?.[2] ? 'Change' : 'Select'}
              </Button>
            }
            avatar={'2'}
            text={{
              primary: 'LOD2 (Low)',
              secondary: lodObj?.[2]?.name ?? '',
            }}
          />
          <TreeListItem
            action={
              <Button
                variant={lodObj?.[1] ? 'text' : 'contained'}
                color={lodObj?.[1] ? 'inherit' : 'primary'}
                onClick={() => handleSelect(1)} size="small"
              >
                {lodObj?.[1] ? 'Change' : 'Select'}
              </Button>
            }
            avatar={'1'}
            text={{
              primary: 'LOD1 (High)',
              secondary: lodObj?.[1]?.name ?? '',
            }}
          />
        </List>
        <Stack spacing={2} sx={{ p: 3 }}>
          <Button variant="contained" fullWidth onClick={handleExport}>Export Package</Button>
        </Stack>
      </Grid>
      <Grid flex={1} sx={{ backgroundColor: '#111' }}>
        <Canvas gl={{ preserveDrawingBuffer: true }}>
          {lods.length > 0 && (
            <Suspense fallback={null}>
              <TreeScene
                lods={lods}
                scale={treeScale}
                captureRef={captureRef}
                onSceneReady={setTreeScene}
              />
            </Suspense>
          )}
        </Canvas>
      </Grid>
    </Grid>
  );
}

const root = createRoot(document.body);

root.render(
  <MesheryTheme>
    <TreeMaker />
  </MesheryTheme>
);