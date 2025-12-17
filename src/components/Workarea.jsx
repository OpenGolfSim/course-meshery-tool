import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Grid, Box, Button, List, ListItem, ListItemText, ListItemAvatar, Avatar, Typography, Chip, TextField, MenuItem, Switch, FormGroup, FormControlLabel, Stack } from '@mui/material';
import MountainIcon from '@mui/icons-material/Landscape';
import SVGIcon from '@mui/icons-material/Polyline';
import DeleteIcon from '@mui/icons-material/Delete';
import * as THREE from 'three';
import pMap from 'p-map';

import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Shape, Grid as ThreeGrid, Line, Bounds, useBounds, CameraControls } from '@react-three/drei';
import LayerList from './LayerList.jsx';
import MeshLayer from './MeshLayer.jsx';
import ShapeLayer from './ShapeLayer.jsx';
import CourseOutline from './CourseOutline.jsx';
import { useMeshery } from '../contexts/Meshery.jsx';
import { addVertexColorsToOBJ } from '../utils/obj.js';


// Helper inside Canvas
function SceneGrabber({ setScene }) {
  const { scene } = useThree();
  useEffect(() => {
    setScene(scene);
  }, [scene]);
  return null;
}

export default function Workarea() {
  const { settings, setSettings } = useMeshery();
  const [scene, setScene] = useState();
  const canvasEle = React.useRef();
  const [selectedLayer, setSelectedLayer] = React.useState();
  const controlsRef = React.useRef();
  const [openSVGFile, setOpenSVGFile] = React.useState();
  const [openTerrainFile, setOpenTerrainFile] = React.useState();
  const [layers, setLayers] = React.useState([]);
  const [palette, setPalette] = React.useState();
  const [terrainSize, setTerrainSize] = React.useState(4097);
  // const [terrainData, setTerrainData] = React.useState();
  const [heightScale, setHeightScale] = React.useState(10);
  const [size, setSize] = React.useState([0, 0]);
  // const boundsApi = useBounds();


  // const handleUpdateMesh = useCallback(async (layer) => {
  //   const meshResult = await window.meshery.generateMesh(layer);
  //   setLayers(old => {
  //     const matched = old.find(l => l.id === layer.id);
  //     matched.mesh = meshResult;
  //     return [...old];
  //   });
  // }, [layers]);

  const handleContextUpdate = async (updatedContext) => {
    console.log('parsed SVG', updatedContext);
    setOpenSVGFile(updatedContext.svg);
    setOpenTerrainFile(updatedContext.raw);
    setPalette(updatedContext.palette);
    setLayers(updatedContext.layers || []);
    setSize([updatedContext.width, updatedContext.height]);
    
    setSettings(settings => ({
      ...settings,
      palette: updatedContext.palette,
      heightMap: updatedContext.heightMap,
      svgWidth: updatedContext.width,
      svgHeight: updatedContext.height
    }));
  }

  const handleZoomComplete = useCallback((layer) => {
    setLayers(layers.map(l => (l.id === layer.id ? { ...l, zoom: false } : l)));
  }, [layers]);
  
  const handleMeshClick = (layer) => {
    console.log('CLICKED MESH', layer.id);
    setSelectedLayer(layer.id);
  }

  const handleWireframeChange = (event) => {
    setSettings(old => ({ ...old, wireframe: event.target.checked }))
  }
  const handleVertexColorChange = (event) => {
    setSettings(old => ({ ...old, vertexColors: event.target.checked }))
  }

  const handleMeshLoaded = (layer) => {
    setLayers(old => {
      const matched = old.find(l => l.id === layer.id);
      matched.mesh = true;
      return [...old];
    });
  }

  const handleImportTerrain = async () => {
    const res = await window.meshery.selectTerrainFile();
    if (!res.raw) {
      return;
    }
    console.log('res', res);
    handleContextUpdate(res);
  }

  const handleImportSVG = async () => {
    const res = await window.meshery.selectSVGFile();
    if (!res.svg) {
      return;
    }
    handleContextUpdate(res);
  }
  const handleTerrainReset = useCallback(async () => {
    const res = await window.meshery.clearTerrain();
    handleContextUpdate(res);
  }, []);
  const handleSVGReset = useCallback(async () => {
    const res = await window.meshery.clearSVG();
    handleContextUpdate(res);
  }, []);
  

  const handleLayerSettingChanged = useCallback((layerUpdate) => {
    setLayers(layers.map(l => {
      const { id, ...update } = layerUpdate;
      if (l.id === id) {
        const copy = { ...l };
        for (const [key, val] of Object.entries(update)) {
          copy[key] = val;
        }
        return copy;
      } else {
        return l;
      }
    }));

    console.log('layerUpdate', layerUpdate);

    // const updated = [...layers];
    // const { id, ...update } = layerUpdate;
    // const match = updated.find(l => l.id === id);
    // for (const [key, val] of Object.entries(update)) {
    //   match[key] = val;
    // }
    // setLayers(updated);
  }, [layers]);

  const handleLayerZoom = useCallback((layer) => {
    console.log('layer click', layer.id);
    setLayers(layers.map(l => {
      if (l.id === layer.id) {
        return { ...l, zoom: true };
      } else {
        return l;
      }
    }));
    // const objectToFit = document.getElementById(layer.id); // Or use a ref system
    // console.log('boundsApi', boundsApi);
    // console.log('objectToFit', objectToFit);
    // boundsApi.current.refresh(objectToFit).fit(); 
  }, [layers]);

  const handleLayerExpand = useCallback((layerId) => {
    setSelectedLayer(layerId);
  }, [settings]);

  const handleExportStart = useCallback(async () => {

    // const exporter = new GLTFExporter();
    const exporter = new OBJExporter();
    const group = new THREE.Group();
    const vertexColorMap = {};
    scene.traverse((obj) => {
      // Get only visible meshes
      if (obj.isMesh && obj.visible && obj.type === 'Mesh' && !!obj.name) {
        // const geo = obj.geometry.clone();
        const clone = obj.clone();
        // if (geo.index) geo.index.needsUpdate = true;
        // geo.computeVertexNormals();     
        // obj.updateMatrixWorld();
        // const mesh = new THREE.Mesh(geo, obj.material);
        // mesh.applyMatrix4(obj.matrixWorld); // Bake transform
        // group.add(mesh);
        const colorsAttribute = clone.geometry.getAttribute('color');
        console.log(colorsAttribute);
        if (colorsAttribute) {
          vertexColorMap[obj.name] = colorsAttribute.array;
        }
        group.add(clone); // Clone so you don't reparent original objects
      }
      // cnt++;
    });
    console.log('exporting group', group);
    console.log('exporting vertexColorMap', vertexColorMap);
    let result = exporter.parse(group);
    result = addVertexColorsToOBJ(result, vertexColorMap);


    window.meshery.exportMeshes(result).then(exportResult => {
      console.log(exportResult);
    }).catch(error => {
      console.error(error);
    });    
  }, [scene]);
  
  // Function to zoom to a specific object
  // const zoomToMesh = (e) => {
  //   // Stop the event from propagating to other handlers (like the Canvas's own click)
  //   e.stopPropagation(); 
  //   // Use the refresh and fit methods from the bounds API, targeting the clicked object
  //   // Margin can be used to add some padding around the object
  //   boundsApi.current.refresh(e.object).fit(); 
  // }

  useEffect(() => {
    window.meshery.getCurrentState().then(handleContextUpdate);
  }, []);
  return (
    <Box sx={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <Box
        sx={theme => ({
          flexGrow: 0,
          flexShrink: 0,
          height: 60,
          px: 3,
          display: 'flex',
          alignItems: 'center',
          boxSizing: 'border-box',
          gap: 2
        })}
      >
        <Box>
          {openSVGFile ? (
            <Chip
              icon={<SVGIcon />}
              sx={{ display: 'flex' }}
              slotProps={{ label: { sx: { flexGrow: 1 } }}}
              label={openSVGFile.split('/').pop()}
              onDelete={handleSVGReset}
            />
          ) : (
            <Button
              variant="contained"
              color="primary"
              fullWidth={true}
              onClick={handleImportSVG}
            >
              Import SVG
            </Button>
          )}
        </Box>

        <Box>
          {openTerrainFile ? (
            <>
              <Chip
                icon={<MountainIcon />}
                label={openTerrainFile.split('/').pop()}
                sx={{ display: 'flex' }}
                slotProps={{ label: { sx: { flexGrow: 1 } }}}
                // deleteIcon={<DeleteIcon />}
                onDelete={handleTerrainReset}
              />
            </>
          ) : (
            <Button
              variant="contained"
              color="primary"
              fullWidth={true}
              onClick={handleImportTerrain}
            >
                Import RAW Terrain
            </Button>
          )}          
        </Box>
        
        <FormControlLabel label="Wireframe" control={<Switch checked={settings.wireframe} onChange={handleWireframeChange} />} />
        <FormControlLabel label="Vertex Colors" control={<Switch checked={settings.vertexColors} onChange={handleVertexColorChange} />} />

        <Button
          sx={{ ml: 'auto' }}
          variant="contained"
          disabled={!openTerrainFile || !openSVGFile}
          color="primary"
          onClick={handleExportStart}
        >
          Export Meshes
        </Button>

      </Box>
      <Box
        sx={theme => ({
          display: 'flex',
          flexDirection: 'row',
          maxHeight: `calc(100% - 60px)`,
          // alignItems: 'stretch',
          flexGrow: 1
        })}
      >
        <Box sx={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ px: 2, flexGrow: 0, flexShrink: 0 }}>
            <Typography sx={{ mb: 1 }} variant="h5" color="textSecondary">Terrain</Typography>
            <TextField
              sx={{ mt: 2 }}
              fullWidth={true}
              label="Height Scale (m)"
              value={heightScale}
              size="small"
              onChange={(e) => setHeightScale(e.target.value)}
            />            
          </Box>

          <Box sx={{ mt: 3, flexGrow: 1, overflow: 'hidden', maxHeight: '100%', display: 'flex', flexDirection: 'column' }}>
            <Typography sx={{ px: 2, mb: 1 }} variant="h5" color="textSecondary">Layers</Typography>
              {layers.length ? (
                <Box sx={{ maxHeight: '100%', overflow: 'auto' }}>
                  <LayerList
                    layers={layers}
                    svgFile={openSVGFile}
                    selectedLayer={selectedLayer}
                    onExpanded={handleLayerExpand}
                    onZoom={handleLayerZoom}
                    onSettingChanged={handleLayerSettingChanged}
                  />
                </Box>                
              ) : null}
          </Box>
        </Box>
        <div className="canvas-div">
          <Canvas camera={{ fov: 100, near: 1, far: 3000, position: [0, 200, 0] }}>
            {/* <Bounds ref={boundsApi} observe={false} fit={false} clip={false}> */}
              {/* <OrbitControls /> */}
              <CameraControls ref={controlsRef} />
              <ambientLight intensity={Math.PI / 2} />
              <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} decay={0} intensity={Math.PI} />
              <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} />
              
              <CourseOutline viewBox={size} color={0xdddd77} />
              {layers.map(layer => {
                return [
                  <ShapeLayer
                    key={`shape_${layer.id}`}
                    layer={layer}
                    viewBox={size}
                    // terrainData={terrainData}
                    heightScale={heightScale}
                    terrainSize={terrainSize}
                  />,
                  <MeshLayer
                    onLoaded={handleMeshLoaded}
                    onZoomComplete={handleZoomComplete}
                    onClick={handleMeshClick}
                    key={layer.id}
                    layer={layer}
                    viewBox={size}
                    controlsRef={controlsRef}
                    // terrainData={terrainData}
                    heightScale={heightScale}
                    terrainSize={terrainSize}
                  />
                ]
              })}
              <ThreeGrid
                cellSize={10}
                sectionSize={100}
                infiniteGrid={true}
                fadeDistance={1500}
                sectionThickness={2}
                sectionColor={0x444444}
              />
            {/* </Bounds> */}
              <SceneGrabber setScene={setScene} />
          </Canvas>
          {/* <div className="overlay">overlay 😍</div> */}
        </div>
      </Box>
    </Box>
  )
}