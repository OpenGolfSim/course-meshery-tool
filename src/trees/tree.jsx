import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import MesheryTheme from '../theme/MesheryTheme.jsx';
import { Avatar, Box, Button, CircularProgress, Grid, List, ListItem, ListItemAvatar, ListItemText, Stack, Typography } from '@mui/material';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Canvas, useThree, useLoader } from '@react-three/fiber';

function TreeScene({ lods, captureRef }) {
  const { gl, scene, camera } = useThree();
  const groupRef = useRef();

  // const lods = [lodObj?.[2], lodObj?.[1], lodObj?.[0]].filter(Boolean);
  const urls = useMemo(() => lods.map(l => l.uri), [lods]);
  const gltfs = useLoader(GLTFLoader, urls);

  // Frame camera around the loaded tree
  useEffect(() => {
    if (!groupRef.current?.children.length) return;

    const box = new THREE.Box3().setFromObject(groupRef.current);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // const maxDim = Math.max(size.x, size.y, size.z);
    // const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI / 180) / 2)) * 1.6;
    const halfFov = (camera.fov * Math.PI / 180) / 2;
    const dist = Math.max(
      size.y / (2 * Math.tan(halfFov)),           // fit height
      size.x / (2 * Math.tan(halfFov * camera.aspect)) // fit width
    ) * 1.2;

    // camera.position.set(
    //   center.x + dist * 0.6,
    //   center.y + dist * 0.2,
    //   center.z + dist * 0.6
    // );
    camera.position.set(center.x, center.y, center.z + dist);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }, [gltfs, camera]);

  // Expose capture to parent
  useEffect(() => {
    captureRef.current = () => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL('image/png');
    };
  }, [gl, scene, camera, captureRef]);

  return (
    <group ref={groupRef}>
      <primitive object={gltfs[0].scene} />
      {/* {gltfs.map((gltf, i) => (
        <primitive key={lods[i].id} object={gltf.scene} />
      ))} */}
    </group>
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
  
  const lods = useMemo(() => {
    return Object.values(lodObj);
  }, [lodObj]);

  // const [thumbnailImage, setThumbnailImage] = useState();
  const captureRef = useRef(null);

  const handleExport = async () => {
    setIsExporting(true);
    const dataUrl = captureRef.current?.();
    console.log('response', dataUrl);
    const response = await window.trees.export(dataUrl);
    console.log('response', response);
    setIsExporting(false);
  }

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
        <List>
          <TreeListItem
            action={
              <Button
                variant={lodObj?.[3] ? 'text' : 'contained'}
                color={lodObj?.[3] ? 'inherit' : 'primary'}
                onClick={() => handleSelect(3)} size="small"
              >
                {lodObj?.[3] ? 'Change' : 'Select'}
              </Button>
            }
            avatar={'B'}
            text={{
              primary: 'Billboard',
              secondary: lodObj?.[3]?.name ?? '',
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
           <ambientLight intensity={2} />
          <directionalLight position={[5, 10, 7]} intensity={1.2} />
          {lods.length > 0 && (
            <Suspense fallback={null}>
              <TreeScene lods={lods} captureRef={captureRef} />
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