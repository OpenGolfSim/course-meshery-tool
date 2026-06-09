import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { Dialog, DialogTitle, DialogContent, Typography, DialogActions, Button, Alert, Stack, Box, Grid, ButtonGroup, TextField, MenuItem, Switch, FormControlLabel } from '@mui/material';
import { useProject } from '../contexts/Project';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { FlyControls, MapControls, OrbitControls, Shape, Grid as ThreeGrid, Line, Bounds, useBounds, CameraControls } from '@react-three/drei';
import NumberField from '../components/NumberField';
import { Accordion, AccordionDetails, AccordionHeader, AccordionSummary, SidebarAccordionGroup } from '../components/Accordion';
import { WireframeOverlay } from '../components/WireframeOverlay';

function Terrain({
  ref,
  heightMapRef,
  heightMapVersion,
  textureUrl,
  brushMode,
  brushStrength,
  heightScale,
  sampledHeight,
  wireframe,
  brushRadius = 10,
  size = 100
}) {
  const internalRef = useRef();
  const maxSegments = 2048;
  const brushPos = useRef(new THREE.Vector3());
  
  const strength = useMemo(() => {
    return brushStrength / 10;
  }, [brushStrength]);

  // expose applyBrush to parent
  React.useImperativeHandle(ref, () => ({

    sampleHeight: (worldPoint) => {
      const mesh = internalRef.current;
      if (!mesh) return null;
      const pos = mesh.geometry.attributes.position;
      const resolution = Math.sqrt(heightMapRef.current.length);
      const segments = Math.min(resolution - 1, maxSegments);
      const cols = segments + 1;
      const halfSize = size / 2;
      const cellSize = size / segments;
      const col = Math.round((worldPoint.x + halfSize) / cellSize);
      const row = Math.round((worldPoint.z + halfSize) / cellSize);
      const idx = row * cols + col;
      if (idx >= 0 && idx < pos.count) return pos.getY(idx);
      return null;
    },    
    applyBrush: (worldPoint) => {
      const mesh = internalRef.current;
      if (!mesh) return;

      const pos = mesh.geometry.attributes.position;
      const resolution = Math.sqrt(heightMapRef.current.length);
      const segments = Math.min(resolution - 1, maxSegments);
      const step = resolution / (segments + 1);
      const cols = segments + 1;
      const rows = cols;
      const halfSize = size / 2;
      const cellSize = size / segments;

      const centerCol = Math.round((worldPoint.x + halfSize) / cellSize);
      const centerRow = Math.round((worldPoint.z + halfSize) / cellSize);
      const radiusCells = Math.ceil(brushRadius / cellSize);

      const minCol = Math.max(0, centerCol - radiusCells);
      const maxCol = Math.min(cols - 1, centerCol + radiusCells);
      const minRow = Math.max(0, centerRow - radiusCells);
      const maxRow = Math.min(rows - 1, centerRow + radiusCells);

      const writeBack = (r, c, idx) => {
        const hm = heightMapRef.current;
        if (!hm) return;

        const newVal = Math.max(0, Math.min(65535,
          Math.round((pos.getY(idx) / heightScale) * 65535)
        ));

        // fill the block of heightmap pixels this geometry vertex represents
        const srcX0 = Math.round(c * step);
        const srcZ0 = Math.round(r * step);
        const srcX1 = Math.round((c + 1) * step);
        const srcZ1 = Math.round((r + 1) * step);

        const xEnd = Math.min(srcX1, resolution);
        const zEnd = Math.min(srcZ1, resolution);

        for (let sz = srcZ0; sz < zEnd; sz++) {
          for (let sx = srcX0; sx < xEnd; sx++) {
            hm[sz * resolution + sx] = newVal;
          }
        }
      };



      if (brushMode === 'raise' || brushMode === 'dig') {
        const direction = brushMode === 'raise' ? 1 : -1;
        for (let r = minRow; r <= maxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            const idx = r * cols + c;
            const vx = pos.getX(idx);
            const vz = pos.getZ(idx);
            const dist = Math.sqrt((vx - worldPoint.x) ** 2 + (vz - worldPoint.z) ** 2);
            if (dist >= brushRadius) continue;
            const falloff = 1 - (dist / brushRadius);
            pos.setY(idx, pos.getY(idx) + direction * strength * falloff);
            writeBack(r, c, idx);
          }
        }
      }

      else if (brushMode === 'smooth') {
        const snapshot = new Float32Array(pos.count);
        for (let r = Math.max(0, minRow - 1); r <= Math.min(rows - 1, maxRow + 1); r++) {
          for (let c = Math.max(0, minCol - 1); c <= Math.min(cols - 1, maxCol + 1); c++) {
            snapshot[r * cols + c] = pos.getY(r * cols + c);
          }
        }
        for (let r = minRow; r <= maxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            const idx = r * cols + c;
            const vx = pos.getX(idx);
            const vz = pos.getZ(idx);
            const dist = Math.sqrt((vx - worldPoint.x) ** 2 + (vz - worldPoint.z) ** 2);
            if (dist >= brushRadius) continue;
            const falloff = 1 - (dist / brushRadius);
            let sum = snapshot[idx];
            let count = 1;
            if (c > 0)        { sum += snapshot[idx - 1];    count++; }
            if (c < cols - 1) { sum += snapshot[idx + 1];    count++; }
            if (r > 0)        { sum += snapshot[idx - cols]; count++; }
            if (r < rows - 1) { sum += snapshot[idx + cols]; count++; }
            const avg = sum / count;
            pos.setY(idx, snapshot[idx] + (avg - snapshot[idx]) * falloff * strength);
            writeBack(r, c, idx);
          }
        }
      }

      else if (brushMode === 'set' && sampledHeight != null) {
        const brushRadiusSq = brushRadius * brushRadius;
        for (let r = minRow; r <= maxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            const idx = r * cols + c;
            const vx = pos.getX(idx);
            const vz = pos.getZ(idx);
            const dx = vx - worldPoint.x;
            const dz = vz - worldPoint.z;
            const distSq = dx * dx + dz * dz;
            if (distSq >= brushRadiusSq) continue;
            const falloff = 1 - Math.sqrt(distSq) / brushRadius;
            const current = pos.getY(idx);
            pos.setY(idx, current + (sampledHeight - current) * falloff * strength);
            writeBack(r, c, idx);
          }
        }
      }

      pos.needsUpdate = true;
    },

    get mesh() { return internalRef.current; }
  }), [heightScale, brushMode, brushRadius, strength, sampledHeight]);

  const texture = useMemo(() => {
    if (!textureUrl) return null;
    if (textureUrl.includes('hillshade')) {
      textureUrl = textureUrl.replace('.tif', '.jpg');
    }
    const tex = new THREE.TextureLoader().load(textureUrl);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }, [textureUrl]);


  const geometry = useMemo(() => {
    if (!heightMapRef.current?.length) {
      return;
    }
    const resolution = Math.sqrt(heightMapRef.current.length);
    const segments = Math.min(resolution - 1, maxSegments);
    const step = resolution / (segments + 1);
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2); // lay it flat
    const pos = geo.attributes.position;
    for (let z = 0; z <= segments; z++) {
      for (let x = 0; x <= segments; x++) {
        const srcX = Math.round(x * step);
        const srcZ = Math.round(z * step);
        const srcIdx = srcZ * resolution + srcX;
        const dstIdx = z * (segments + 1) + x;
        pos.setY(dstIdx, heightMapRef.current[srcIdx] / 65535 * heightScale);
      }
    }
    geo.computeVertexNormals();
    return geo;
  }, [heightMapVersion, heightScale]);

  const handleMouseDown = (e) => {
    if (e.button !== 0) {
      return;
    }
    e.stopPropagation();
    console.log('handleMouseDown', e);
  }
  const handleMouseUp = (e) => {
    if (e.button !== 0) {
      return;
    }
    console.log('handleMouseUp', e);
  }

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#fff',
      map: texture,
      wireframe
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uBrushPos = { value: brushPos.current };
      shader.uniforms.uBrushRadius = { value: brushRadius };
      shader.uniforms.uBrushVisible = { value: 0.0 };

      // pass world position from vertex shader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldPos;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 worldPos4 = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos4.xyz;`
      );


      // draw circle in fragment shader
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uBrushPos;
        uniform float uBrushRadius;
        uniform float uBrushVisible;
        varying vec3 vWorldPos;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        if (uBrushVisible > 0.5) {
          float dist = distance(vWorldPos.xz, uBrushPos.xz);
          float ring = smoothstep(uBrushRadius - 0.25, uBrushRadius, dist)
                      + (1.0 - smoothstep(uBrushRadius, uBrushRadius + 0.25, dist));
          ring = 1.0 - ring;
          // soft filled circle with bright edge
          float fill = 1.0 - smoothstep(0.0, uBrushRadius, dist);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.0, 1.0, 1.0), fill * 0.15);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.0, 0.0, 0.0), ring * 0.4);
        }`
      );

      mat.userData.shader = shader; // keep a ref to update uniforms later
    };

    return mat;
  }, [brushRadius, texture, wireframe]);

  return (
    <mesh
      ref={internalRef}
      geometry={geometry}
      material={material}
    />
  );
}

function TerrainInteraction({ meshRef, onHit, onSampleHeight }) {
  const { camera, gl } = useThree();
  const painting = useRef(false);
  const lastApply = useRef(0);

  const groundPlane = useMemo(() => {
    const geo = new THREE.PlaneGeometry(10000, 10000);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    mesh.visible = false;
    return mesh;
  }, []);

  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const getGroundPoint = (e) => {
      mouse.set(
        (e.offsetX / gl.domElement.clientWidth) * 2 - 1,
        -(e.offsetY / gl.domElement.clientHeight) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(groundPlane);
      return hits.length > 0 ? hits[0].point : null;
    };

    const handleDown = (e) => {
      if (e.button !== 0) return;

      if (e.shiftKey && onSampleHeight) {
        const point = getGroundPoint(e);
        if (point) {
          const h = meshRef.current?.sampleHeight(point);
          if (h != null) onSampleHeight(h);
        }
        return; // don't paint
      }

      painting.current = true;
      const point = getGroundPoint(e);
      if (point) onHit(point);
    };

    const handleMove = (e) => {
      const point = getGroundPoint(e);
      if (!point) return;

      // update brush cursor (keep this every frame)
      const shader = meshRef.current?.mesh?.material.userData.shader;
      if (shader) {
        shader.uniforms.uBrushPos.value.copy(point);
        shader.uniforms.uBrushVisible.value = 1.0;
      }

      // throttle actual brush application
      if (painting.current) {
        const now = performance.now();
        if (now - lastApply.current > 30) {
          onHit(point);
          lastApply.current = now;
        }
      }
    };

    const handleUp = () => {
      painting.current = false;
      const mesh = meshRef.current?.mesh;
      if (mesh) mesh.geometry.computeVertexNormals();
    };

    gl.domElement.addEventListener('pointerdown', handleDown);
    gl.domElement.addEventListener('pointermove', handleMove);
    gl.domElement.addEventListener('pointerup', handleUp);
    return () => {
      gl.domElement.removeEventListener('pointerdown', handleDown);
      gl.domElement.removeEventListener('pointermove', handleMove);
      gl.domElement.removeEventListener('pointerup', handleUp);
    };
  }, [camera, gl, meshRef, onHit, groundPlane]);

  return null;
}

function BrushModeButton({ children, active, ...rest }) {
  return (
    <Button
      fullWidth={true}
      variant="contained"
      color={active ? 'primary' : 'inherit'}
      {...rest}
    >
      {children}
    </Button>
  );
}
export default function EditTerrainDialog(props) {
  const { project } = useProject();
  const { onClose, open, systemError } = props;
  const controlsRef = useRef();
  const meshRef = useRef();
  const heightMap = useRef();
  const [heightMapVersion, setHeightMapVersion] = useState(0);
  // const [heightMap, setHeightMap] = useState();
  const [heightScale, setHeightScale] = useState(project.stats?.relief || 10);
  const [brushRadius, setBrushRadius] = useState(12);
  const [brushStrength, setBrushStrength] = useState(3);
  const [smoothStrength, setSmoothStrength] = useState(2);
  const [sampledHeight, setSampledHeight] = useState(0);
  const [brushMode, setBrushMode] = useState('smooth');
  const [smoothPending, setSmoothPending] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState('brush');
  const [isWireframe, setIsWireframe] = useState(true);

  const [displayImage, setDisplayImage] = useState(
    project?.satellite ? Object.values(project.satellite)?.[0]?.uri : ''
  );

  const canvasSize = useMemo(() => {
    return project?.settings?.distance ? project.settings.distance * 1000 : 100;
  }, [project?.settings?.distance]);

  const handlePanelChange = (panel) => (event, newExpanded) => {
    setPanelExpanded(newExpanded ? panel : false);
  };  

  const handleSmoothAll = useCallback(async () => {
    try {
      setSmoothPending(true);
      // let current = meshRef.current?.exportHeightMap();
      // console.log('smooth data', current);
      // current = current || heightMap;
      const hm = heightMap.current;
      console.log('smooth-all sending, sample values:', hm[0], hm[500], hm[1000]);
      console.log('same ref?', hm === heightMap.current);
      const res = await window.meshery.terrain.applySmoothing(hm, smoothStrength);
      if (!res) {
        throw new Error('Empty response');
      }
      const view = new Uint16Array(res);
      console.log(view);
      heightMap.current = view;
      setHeightMapVersion(v => v + 1);
      // setHeightMap(view);
    } catch (error) {
      console.error(error);
    } finally {
      setSmoothPending(false);
    }
  }, [smoothStrength]);

  const handleClose = () => {
    onClose();
  };
  
  const handleSaveChanges = useCallback(async () => {
    // const current = meshRef.current?.exportHeightMap() || heightMap;
    await window.meshery.terrain.saveHeightMap(heightMap.current);
    // console.log('heightMap', heightMap);
    onClose();
  }, []);

  const handleListItemClick = (value) => {
    onClose(value);
  };
  const handleModeChange = (value) => {
    setBrushMode(value);
  };

  const loadRawData = async (uri) => {
    const response = await fetch(uri);
    const buffer = await response.arrayBuffer();
    heightMap.current = new Uint16Array(buffer);
    setHeightMapVersion(v => v + 1);
    // setHeightMap(view);
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    if (project.raw?.uri) {
      console.log('project.raw', project.raw.uri);
      loadRawData(project.raw.uri);
    }
  }, [open]);

  // useEffect(() => {
  //   console.log('heightmapChange', heightMap);
  // }, [heightMap]);
  return (
    <Dialog
      onClose={handleClose}
      open={open}
      color="error"
      fullScreen={true}
      fullWidth={true}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          py: 2,
          px: 3,
          alignItems: 'center',
        }}
      >
        <Typography sx={{ flex: 1 }}>
          Edit Terrain
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button variant="contained" color="inherit" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="contained" color="primary" onClick={handleSaveChanges}>
            Save Changes
          </Button>
        </Stack>
      </DialogTitle>

      <Grid container={true} sx={{ flex: 1, height: '100%' }}>
        <Grid
          sx={theme => ({
            backgroundColor: theme.palette.background.paper,
            width: 210,
            display: 'flex',
            flexDirection: 'column'
          })}
        >
          <SidebarAccordionGroup>
            <Accordion expanded={panelExpanded === 'brush'} onChange={handlePanelChange('brush')}>
              <AccordionSummary id="brush-header">
                <AccordionHeader>Brush</AccordionHeader>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 2 }}>
                <Stack spacing={3}>
                  <Box sx={{ pt: 2 }}>
                    <TextField
                      fullWidth={true}
                      label="Mode"
                      select={true}
                      size="small"
                      value={brushMode}
                      onChange={(event) => handleModeChange(event.target.value)}
                    >
                      <MenuItem value="smooth">Smooth</MenuItem>
                      <MenuItem value="dig">Dig</MenuItem>
                      <MenuItem value="raise">Raise</MenuItem>
                      <MenuItem value="set">Set Height</MenuItem>
                    </TextField>
                  </Box>

                  <Box sx={{ pt: 2 }}>
                    <NumberField
                      label="Brush Radius"
                      value={brushRadius}
                      size="small"
                      min={0}
                      max={500}
                      fullWidth={true}
                      onChange={(val) => setBrushRadius(val)}
                    />
                  </Box>
                  <Box sx={{ pt: 2 }}>
                    <NumberField
                      label="Strength"
                      value={brushStrength}
                      size="small"
                      min={0}
                      step={0.1}
                      max={10}
                      fullWidth={true}
                      onChange={(val) => setBrushStrength(val)}
                    />
                  </Box>

                  {brushMode === 'smooth' ? (
                    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                      <NumberField
                        label="Smooth Amount"
                        value={smoothStrength}
                        size="small"
                        min={0}
                        step={1}
                        max={50}
                        fullWidth={true}
                        onChange={(val) => setSmoothStrength(val)}                          
                      />
                      <Button
                        sx={{ mt: 1 }}
                        disabled={smoothPending}
                        color="secondary"
                        variant="contained"
                        fullWidth
                        size="small"
                        onClick={handleSmoothAll}
                      >
                        Smooth All
                      </Button>
                    </Stack>
                  ) : null}

                  {brushMode === 'set' ? (
                    <Box sx={{ pt: 2 }}>
                      <NumberField
                        label="Height"
                        fullWidth
                        value={sampledHeight}
                        size="small"
                        min={0}
                        step={0.05}
                        max={500}
                        onChange={(val) => setSampledHeight(val)}
                      />
                    </Box>
                  ) : null}
                </Stack>
              </AccordionDetails>
            </Accordion>
            <Accordion expanded={panelExpanded === 'image'} onChange={handlePanelChange('image')}>
              <AccordionSummary id="image-header">
                <AccordionHeader sx={{ flex: 1, alignContent: 'center' }} variant="h5" color="textSecondary">
                  Image
                </AccordionHeader>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 3 }}>
                <Box>
                  <TextField
                    fullWidth
                    label="Image Layer"
                    select={true}
                    size="small"
                    value={displayImage}
                    onChange={(event) => setDisplayImage(event.target.value || '')}
                    slotProps={{
                      select: { displayEmpty: true }
                    }}
                  >
                    <MenuItem value={''}>None</MenuItem>
                    {Object.values(project.satellite).map(sat => {
                      return (<MenuItem key={sat.uri} value={sat.uri}>Satellite ({sat.source})</MenuItem>);
                    })}
                    {project.hillShade ? (
                      <MenuItem value={project.hillShade.uri}>Hillshade</MenuItem>
                    ) : null}
                  </TextField>
                </Box>
                <Box sx={{ p: 2 }}>
                  <FormControlLabel control={<Switch size="small" checked={isWireframe} onChange={(e) => setIsWireframe(e.target.checked)} />} label="Wireframe" />
                </Box>

              </AccordionDetails>
            </Accordion>
          </SidebarAccordionGroup>
          <Box sx={{ px: 3, pb: 3, flex: 0 }}>
            <Typography variant="caption" color="textSecondary">
              <strong>Right-click</strong> = Pan<br />
              <strong>Shift + Right-click</strong> = Tilt
            </Typography>
          </Box>
        </Grid>
        <Grid
          sx={theme => ({
            flex: 1,
            backgroundColor: theme.palette.grey[900]
          })}
        >
          <Canvas camera={{ fov: 50, near: 1, far: 3000, position: [canvasSize / 2, canvasSize / 2, canvasSize / 2] }}>
            <MapControls
              ref={controlsRef}
              mouseButtons={{
                LEFT: null, // Disable left-click
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN // Set Right-click to Pan
              }}
            />
            <ambientLight intensity={0.6} />
            <directionalLight position={[200, 50, 100]} intensity={1.6} />
            <boxGeometry args={[2, 2, 2]} />

            <ThreeGrid
              cellSize={10}
              sectionSize={100}
              infiniteGrid={true}
              fadeDistance={1500}
              sectionThickness={2}
              sectionColor={0x444444}
            />

            <React.Suspense fallback={null}>
              <Terrain
                ref={meshRef}
                heightMapVersion={heightMapVersion}
                heightMapRef={heightMap}
                textureUrl={displayImage}
                wireframe={isWireframe}
                brushMode={brushMode}
                brushRadius={brushRadius}
                brushStrength={brushStrength}
                heightScale={heightScale}
                sampledHeight={sampledHeight}
                size={canvasSize}
              />
            </React.Suspense>
            <TerrainInteraction
              meshRef={meshRef}
              onHit={(point) => meshRef.current?.applyBrush(point)}
              onSampleHeight={(h) => setSampledHeight(h)}
            />
          </Canvas>

        </Grid>
      </Grid>

    </Dialog>
  );
 
}