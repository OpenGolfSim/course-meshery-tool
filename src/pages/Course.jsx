import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Box, Button, Checkbox, FormControlLabel, FormGroup, Menu, MenuItem, Popover, Stack, Typography } from "@mui/material";
import { useProject } from '../contexts/Project';
import { useMeshery } from '../contexts/Meshery.jsx';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Shape, Grid as ThreeGrid, Line, Bounds, useBounds, CameraControls } from '@react-three/drei';
import CourseOutline from '../components/CourseOutline.jsx';
import LayerSettings from '../components/LayerSettings.jsx';
import ShapeLayer from '../components/ShapeLayer.jsx';
import MeshLayer from '../components/MeshLayer.jsx';
import { addVertexColorsToOBJ } from '../utils/obj.js';
import SurfaceSettings from '../components/SurfaceSettings.jsx';
import CurveEditDialog from '../dialogs/CurveEditDialog.jsx';
// import LasWorker from '../workers/las.worker.js';
// import PointCloud, { CLASSIFICATION_CODES } from '../components/PointCloud.jsx';
// import LayerSettings from '../components/LayerSettings.jsx';
// import CourseOutline from '../components/CourseOutline.jsx';

// // Helper inside Canvas
function SceneGrabber({ setScene }) {
  const { scene } = useThree();
  useEffect(() => {
    setScene(scene);
  }, [scene]);
  return null;
}

export default function Course() {
  const { project } = useProject();
  const { generateAllMeshes } = useMeshery();
  const controlsRef = useRef();
  const [scene, setScene] = useState();
  const [visibilityMenu, setVisibilityMenu] = useState();
  const [selectedLayer, setSelectedLayer] = useState();
  // // const [arrayBuffer, setArrayBuffer] = useState();
  const [layers, setLayers] = useState([]);
  const [curveEditorOpen, setCurveEditorOpen] = useState(false);
  
  // const viewBoxSize = useMemo(() => {
  //   return project.settings.distance * 1000;
  // }, [project.settings.distance]);

  const handleCurvePointsSaved = () => {
    setCurveEditorOpen(false);
  }

  const handleLayerZoom = useCallback((layer) => {
    // updateLayerById(layer.id, { zoom: true });
  }, [layers]);

  const handleLayerClick = useCallback((event, layer) => {
    setSelectedLayer({ target: event.currentTarget, layer });
  }, []);
  const handleSettingsClose = useCallback((event, layer) => {
    setSelectedLayer(null);
  }, []);

  const handleLayerExpand = useCallback((panel, isExpanded) => {
    console.log('layer expand', panel);
    // setSelectedLayer(isExpanded ? panel : false);
  }, []);

  const handleZoomComplete = useCallback((layer) => {
    // updateLayerById(layer.id, { zoom: false });
  }, [layers]);
  
  const handleMeshClick = (layer) => {
    setSelectedLayer(layer.id);
  }
  const handleExportOBJ = () => {
    handleExportStart();
  }
  const handleGenerateMeshes = () => {
    generateAllMeshes();
  }

  const handleExportStart = useCallback(async () => {
    const exporter = new OBJExporter();
    const group = new THREE.Group();
    const vertexColorMap = {};
    scene.traverse((obj) => {
      // Get only visible meshes with names
      if (obj.isMesh && obj.visible && obj.type === 'Mesh' && !!obj.name) {
        const clone = obj.clone();
        const colorsAttribute = clone.geometry.getAttribute('color');
        if (colorsAttribute) {
          vertexColorMap[obj.name] = colorsAttribute.array;
        }
        group.add(clone); // Clone so you don't reparent original objects
      }
    });
    let result = exporter.parse(group);
    result = addVertexColorsToOBJ(result, vertexColorMap);

    window.meshery.exportMeshes(result).then(exportResult => {
      console.log(exportResult);
    }).catch(error => {
      console.error(error);
    });    
  }, [scene]);

  return (
    <React.Fragment>
      <Box
        sx={theme => ({
          display: 'flex',
          flexDirection: 'row',
          flexGrow: 1,
          flexShrink: 0,
          height: '100%',
          maxHeight: '100%'
        })}
      >
        <Box sx={{ width: 220, flexGrow: 0, flexShrink: 0, display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>
          <Stack sx={{ p: 3 }} direction="column">
            <Button onClick={handleGenerateMeshes} fullWidth variant="contained">Generate Meshes</Button>

            <Button disabled={!project._layers?.length} onClick={handleExportOBJ} fullWidth variant="contained">Export Course</Button>
          </Stack>
          <Box sx={{ mt: 3, flexGrow: 1, overflow: 'hidden', height: '80%', display: 'flex', flexDirection: 'column' }}>
            <Typography sx={{ px: 2, mb: 1 }} variant="h5" color="textSecondary">Layers ({project._layers?.length || 0})</Typography>
            {project._layers?.length ? (
              <Box sx={{ overflow: 'auto' }}>
                {project._layers.map(layer => (
                  <LayerSettings
                    key={layer.id}
                    layer={layer}
                    selectedLayer={selectedLayer}
                    onZoom={handleLayerZoom}
                    onExpand={handleLayerExpand}
                    onClick={handleLayerClick}
                  />
                ))}
                <Popover
                  open={Boolean(selectedLayer?.target)}
                  anchorEl={selectedLayer?.target}
                  onClose={handleSettingsClose}
                  anchorOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                  }}
                  transformOrigin={{
                    vertical: 'top',
                    horizontal: 'left'
                  }}
                >
                  {selectedLayer ? (
                    <SurfaceSettings
                      surface={selectedLayer.layer.surface}
                      spacing={selectedLayer.layer.spacing}
                      blending={selectedLayer.layer.blending}
                      dig={selectedLayer.layer.dig}
                      onClick={handleLayerClick}
                      // onSpacingChange={handleSpacingChange}
                      // onBlendToggle={(checked) => handleBlendChange('enabled', checked)}
                      // onBlendChange={(key, value) => handleBlendChange(key, value)}
                      // onDigToggle={(checked) => handleDigChange('enabled', checked)}
                      // onDigChanged={(key, value) => handleDigChange(key, value)}
                    />
                  ) : null}
                </Popover>
              </Box>
            ) : null}
          </Box>
        </Box>
        <Box sx={{ flex: 1, backgroundColor: 'black' }}>

          <Canvas camera={{ fov: 50, near: 0.5, far: 3000, position: [0, 300, 0] }}>
            <CameraControls ref={controlsRef} />
            <ambientLight intensity={Math.PI / 2} />
            <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} decay={0} intensity={Math.PI} />
            <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} />
            
            <CourseOutline color={0xdddd77} />

            {project._layers?.map(layer => {
              return [
                <ShapeLayer opacity={0.5} key={`shape_${layer.id}`} polygon={layer.polygon} layer={layer} />,
                <MeshLayer
                  onZoomComplete={handleZoomComplete}
                  onClick={handleMeshClick}
                  key={layer.id}
                  layer={layer}
                  controlsRef={controlsRef}
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
            <SceneGrabber setScene={setScene} />
          </Canvas>

        </Box>
      </Box>
      <CurveEditDialog layer={selectedLayer?.layer} open={curveEditorOpen} onClose={handleCurvePointsSaved} />
    </React.Fragment>
  )
}