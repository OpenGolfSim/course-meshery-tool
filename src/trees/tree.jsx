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


// ---- Billboard generation ----------------------------------------------

function snapshot(renderer) {
  const c = document.createElement('canvas');
  c.width = renderer.domElement.width;
  c.height = renderer.domElement.height;
  c.getContext('2d').drawImage(renderer.domElement, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function captureView(renderer, scene, box, view) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  let w, h, pos, up;
  if (view === 'front') {
    w = size.x; h = size.y;
    pos = [center.x, center.y, box.max.z + size.z];
    up = [0, 1, 0];
  } else if (view === 'side') {
    w = size.z; h = size.y;
    pos = [box.max.x + size.x, center.y, center.z];
    up = [0, 1, 0];
  } else { // top
    w = size.x; h = size.z;
    pos = [center.x, box.max.y + size.y, center.z];
    up = [0, 0, -1];
  }

  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, size.length() * 4);
  cam.position.set(...pos);
  cam.up.set(...up);
  cam.lookAt(center);
  renderer.render(scene, cam);
  return snapshot(renderer);
}

function buildBillboard(box, tex) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const group = new THREE.Group();
  // const mat = (map) => new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide });
  const mat = (map) => new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  });
  // const front = new THREE.Mesh(new THREE.PlaneGeometry(size.x, size.y), mat(tex.front));
  // front.position.y = size.y / 2;
  // Bake placement into vertex data (identity node transforms): the worker's
  // primitive consolidation discards node transforms, so they must not carry
  // any information. Order matters: rotate first, then translate.
  const frontGeo = new THREE.PlaneGeometry(size.x, size.y);
  frontGeo.translate(center.x, box.min.y + size.y / 2, center.z);
  const front = new THREE.Mesh(frontGeo, mat(tex.front));

  // const side = new THREE.Mesh(new THREE.PlaneGeometry(size.z, size.y), mat(tex.side));
  // side.rotation.y = Math.PI / 2;
  // side.position.y = size.y / 2;
  const sideGeo = new THREE.PlaneGeometry(size.z, size.y);
  sideGeo.rotateY(Math.PI / 2);
  sideGeo.translate(center.x, box.min.y + size.y / 2, center.z);
  const side = new THREE.Mesh(sideGeo, mat(tex.side));

  // const top = new THREE.Mesh(new THREE.PlaneGeometry(size.x, size.z), mat(tex.top));
  // top.rotation.x = -Math.PI / 2;
  // top.position.y = size.y * 0.65; // canopy height — tune
  const topGeo = new THREE.PlaneGeometry(size.x, size.z);
  topGeo.rotateX(-Math.PI / 2);
  topGeo.translate(center.x, box.min.y + size.y * 0.65, center.z); // canopy height — tune
  const top = new THREE.Mesh(topGeo, mat(tex.top));

  group.add(front, side, top);
  return group;
}

async function generateBillboardGLB(treeScene) {
  const clone = treeScene.clone(true);
  // Capture pure albedo: swap every material for an unlit equivalent that keeps
  // the color map/tint/alpha. Lighting is NOT baked into the texture — it gets
  // applied at runtime by the billboard's lit material, matching the PBR LODs.
  clone.traverse((o) => {
    if (!o.isMesh) return;
    const toBasic = (src) => new THREE.MeshBasicMaterial({
      map: src.map ?? null,
      color: src.color?.clone() ?? new THREE.Color(0xffffff),
      vertexColors: src.vertexColors ?? false,
      alphaTest: src.alphaTest || (src.transparent ? 0.5 : 0),
      side: src.side,
    });
    o.material = Array.isArray(o.material) ? o.material.map(toBasic) : toBasic(o.material);
  });

  const captureScene = new THREE.Scene();
  // captureScene.add(new THREE.AmbientLight(0xffffff, 3));
  captureScene.add(clone);

  const box = new THREE.Box3().setFromObject(clone);

  const rt = new THREE.WebGLRenderer({ alpha: true });
  rt.setSize(1024, 1024);
  rt.setClearColor(0x000000, 0);

  const textures = {
    front: captureView(rt, captureScene, box, 'front'),
    side: captureView(rt, captureScene, box, 'side'),
    top: captureView(rt, captureScene, box, 'top'),
  };
  rt.dispose();

  const billboard = buildBillboard(box, textures);
  return new GLTFExporter().parseAsync(billboard, { binary: true }); // ArrayBuffer
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
  // const step = height > 10 ? 5 : 1;
  // const top = Math.ceil(height / step) * step;   // e.g. 53.2 → 55
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

  // const lods = [lodObj?.[2], lodObj?.[1], lodObj?.[0]].filter(Boolean);
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


    // const maxDim = Math.max(size.x, size.y, size.z);
    // const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI / 180) / 2)) * 1.6;
    const halfFov = (camera.fov * Math.PI / 180) / 2;
    const dist = Math.max(
      // size.y / (2 * Math.tan(halfFov)),           // fit height
      top / (2 * Math.tan(halfFov)),              // fit ruler height (>= tree height)
      size.x / (2 * Math.tan(halfFov * camera.aspect)) // fit width
    ) * 1.2;

    // camera.position.set(
    //   center.x + dist * 0.6,
    //   center.y + dist * 0.2,
    //   center.z + dist * 0.6
    // );
    // camera.position.set(center.x, center.y, center.z + dist);
    // camera.lookAt(center);
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
                  disabled={!treeScene || isGenerating}
                  onClick={handleGenerateBillboard}
                >
                  {isGenerating ? 'Generating...' : billboardGlb ? 'Regenerate' : 'Generate'}
                </Button>
                <Button
                  variant={lodObj?.[3] ? 'text' : 'contained'}
                  color={lodObj?.[3] ? 'inherit' : 'primary'}
                  onClick={() => handleSelect(3)} size="small"
                >
                  {lodObj?.[3] ? 'Change' : 'Select'}
                </Button>
              </Stack>

            }
            avatar={'B'}
            text={{
              primary: 'LOD3 (Billboard)',
              secondary: lodObj?.[3]?.name ?? (billboardGlb ? 'Auto-generated' : ''),
              // secondary: lodObj?.[3]?.name ?? '',
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
        {/* <Button fullWidth onClick={handleSelect}>Add LOD</Button> */}
        <Stack spacing={2} sx={{ p: 3 }}>
          <Button variant="contained" fullWidth onClick={handleExport}>Export Package</Button>
        </Stack>
      </Grid>
      <Grid flex={1} sx={{ backgroundColor: '#111' }}>
        <Canvas gl={{ preserveDrawingBuffer: true }}>
          {/* <ambientLight intensity={2} />
          <directionalLight position={[5, 10, 7]} intensity={1.2} /> */}
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