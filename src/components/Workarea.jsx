import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Grid, Box, Button, List, ListItem, ListItemText, ListItemAvatar, Avatar, Typography, Chip, TextField, MenuItem, Switch, FormGroup, FormControlLabel, Stack, IconButton, Menu, ListItemIcon } from '@mui/material';
import MoreHorizIcon from '@mui/icons-material/KeyboardArrowDown';
import CheckIcon from '@mui/icons-material/Check';
import VisibilityIcon from '@mui/icons-material/Visibility';
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
import ErrorDialog from '../dialogs/ErrorDialog.jsx';
import TerrainSettings from './TerrainSettings.jsx';
import LayerListItem from './LayerListItem.jsx';
import CurveEditDialog from '../dialogs/CurveEditDialog.jsx';
import LoadingDialog from '../dialogs/LoadingDialog.jsx';
import ImportSettingsDialog from '../dialogs/ImportSettingsDialog.jsx';
import LayerSettings from './LayerSettings.jsx';


// Helper inside Canvas
function SceneGrabber({ setScene }) {
  const { scene } = useThree();
  useEffect(() => {
    setScene(scene);
  }, [scene]);
  return null;
}

export default function Workarea() {
  const {
    settings,
    setSettings,
    setInputHeightMap,
    setSvgData,
    systemError,
    setSystemError,
    clearSystemError,
    clearSVG,
    layers,
    setLayers,
    updateLayerById,
    systemLoading,
    clearSystemLoading,
    setSystemLoading,
    setIsImportReady,
    isImportReady,
    setLayerSettings
  } = useMeshery();
  const [scene, setScene] = useState();
  const canvasEle = React.useRef();
  const [visibilityMenu, setVisibilityMenu] = useState();
  const [selectedLayer, setSelectedLayer] = React.useState();
  const [curveEditorOpen, setCurveEditorOpen] = useState(false);
  const controlsRef = React.useRef();
  const [openSVGFile, setOpenSVGFile] = React.useState();
  const [openTerrainFile, setOpenTerrainFile] = React.useState();
  // const [layers, setLayers] = React.useState([]);
  const [palette, setPalette] = React.useState();
  const [terrainSize, setTerrainSize] = React.useState(4097);
  // const [terrainData, setTerrainData] = React.useState();
  const [heightScale, setHeightScale] = React.useState(10);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState();
  
  const handleImportDialogClose = useCallback((startImport) => {
    setIsImportDialogOpen(false);
    console.log('startImport', startImport);
    if (startImport) {
      setIsImportReady(true);
    } else {
      clearSVG();
    }
  }, []);


  const isExportDisabled = useMemo(() => {
    return !settings.svgFilePath || !settings.rawFilePath || !layers?.length || layers?.some(layer => layer.error || !layer.conformed);
  }, [settings.svgFilePath, settings.rawFilePath, layers]);

  const handleZoomComplete = useCallback((layer) => {
    updateLayerById(layer.id, { zoom: false });
  }, [layers]);
  
  const handleMeshClick = (layer) => {
    setSelectedLayer(layer.id);
  }

  const handleWireframeToggle = () => {
    setSettings(old => ({ ...old, wireframe: !old.wireframe }))
  }
  const handleVertexColorToggle = (event) => {
    setSettings(old => ({ ...old, vertexColors: !old.vertexColors }))
  }

  const handleImportTerrain = async () => {
    const result = await window.meshery.selectTerrainFile();
    // if (result?.raw) {
    //   setOpenTerrainFile(result.raw);
    // }
    if (result?.raw) {
      setSystemLoading('Reading RAW file...');
      setSettings(settings => ({
        ...settings,
        rawFilePath: result?.raw,
        terrainSize: result?.terrainSize,
      }));
      if (!result?.heightMap) {
        setSystemError('Raw file seems to be missing height-map data');
        return;
      }
      setInputHeightMap(result.heightMap);
    }
  }

  const handleImportSVG = async () => {
    const result = await window.meshery.selectSVGFile();
    // if (result?.svg) {
    //   setOpenSVGFile(result.svg);
    // }
    // if (result?.palette) {
    //   setPalette(result.palette);    
    // }
    console.log('HANDLE IMPORT', result);
    if(result?.layerSettings) {
      setLayerSettings(result.layerSettings);
    }
    if (result?.path) {
      // setSystemLoading('Reading SVG file...');
      setSettings(settings => ({
        ...settings,
        palette: result.palette,
        svgFilePath: result.path,
        svgSize: result.svgSize
      }));
      // await handleSVGImported(result);
    }
    if (result?.layers?.length) {
      setLayers(result?.layers);
      setIsImportDialogOpen(true);
    }
    // if (result?.svg) {
    //   setSvgData(result.svg);
    // }
    
    // if (result?.layers) {
    //   setLayers(result.layers);
    // }

    // setSettings(settings => ({
    //   ...settings,
    //   palette: result?.palette,
    //   svgFilePath: result?.svg,
    //   svgSize: [result?.width, result?.height]
    // }));
  }

  const handleTerrainReset = useCallback(async () => {
    // const res = await window.meshery.clearTerrain();
    // handleContextUpdate(res);
    setSettings(settings => ({
      ...settings,
      rawFilePath: undefined,
      heightMap: undefined
    }));
  }, []);

  const handleSVGReset = useCallback(async () => {
    clearSVG();
  
    // const res = await window.meshery.clearSVG();
    // handleContextUpdate(res);
  }, []);

  const handleLayerZoom = useCallback((layer) => {
    updateLayerById(layer.id, { zoom: true });
  }, [layers]);

  const handleLayerExpand = useCallback((panel, isExpanded) => {
    setSelectedLayer(isExpanded ? panel : false);
  }, []);

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
    <>
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
            {settings.rawFilePath ? (
              <>
                <Chip
                  icon={<MountainIcon />}
                  label={`${settings.rawFilePath.split('/').pop()} (${settings.terrainSize}x${settings.terrainSize})`}
                  sx={{ display: 'flex' }}
                  slotProps={{ label: { sx: { flexGrow: 1 } }}}
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
          <Box>
            {settings.svgFilePath ? (
              <Chip
                icon={<SVGIcon />}
                sx={{ display: 'flex' }}
                slotProps={{ label: { sx: { flexGrow: 1 } }}}
                label={`${settings.svgFilePath.split('/').pop()} (${settings.svgSize.join('x')})`}
                onDelete={clearSVG}
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
          
          <Box sx={{ ml: 'auto', mr: 1 }}>
            <Button color="inherit" endIcon={<MoreHorizIcon />} onClick={(e) => setVisibilityMenu(e.currentTarget)}>
              <VisibilityIcon />
            </Button>
            <Menu
              anchorEl={visibilityMenu}
              open={Boolean(visibilityMenu)}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}              
              onClose={() => setVisibilityMenu(null)}
            >
              <MenuItem onClick={handleWireframeToggle}>
                {settings.wireframe ? (
                  <ListItemIcon><CheckIcon /></ListItemIcon>            
                ) : null}
                <ListItemText inset={!settings.wireframe}>Wireframe</ListItemText>
              </MenuItem>
              <MenuItem onClick={handleVertexColorToggle}>
                {settings.vertexColors ? (
                  <ListItemIcon><CheckIcon /></ListItemIcon>            
                ) : null}
                <ListItemText inset={!settings.vertexColors}>Vertex Colors</ListItemText>
              </MenuItem>
            </Menu>
          </Box>
          {/* <FormControlLabel label="Wireframe" control={<Switch checked={settings.wireframe} onChange={handleWireframeChange} />} />
          <FormControlLabel label="Vertex Colors" control={<Switch checked={settings.vertexColors} onChange={handleVertexColorChange} />} /> */}

          <Button
            // sx={{ ml: 'auto' }}
            variant="contained"
            disabled={isExportDisabled}
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
            <TerrainSettings />

            <Box sx={{ mt: 3, flexGrow: 1, overflow: 'hidden', maxHeight: '100%', display: 'flex', flexDirection: 'column' }}>
              <Typography sx={{ px: 2, mb: 1 }} variant="h5" color="textSecondary">Layers</Typography>
                {isImportReady && layers.length ? (
                  <Box sx={{ maxHeight: '100%', overflow: 'auto' }}>
                    {layers.map(layer => (
                      <LayerSettings
                        key={layer.id}
                        layer={layer}
                        selectedLayer={selectedLayer}
                        onZoom={handleLayerZoom}
                        onExpand={handleLayerExpand}
                      />
                    ))}
                    {/* <LayerList
                      layers={layers}
                      svgFile={openSVGFile}
                      selectedLayer={selectedLayer}
                      onExpanded={handleLayerExpand}
                      onZoom={handleLayerZoom}
                      onSettingChanged={handleLayerSettingChanged}
                    /> */}
                  </Box>
                ) : null}
            </Box>
          </Box>
          <div className="canvas-div">
            <Canvas camera={{ fov: 50, near: 1, far: 3000, position: [0, 300, 0] }}>
              {/* <Bounds ref={boundsApi} observe={false} fit={false} clip={false}> */}
                {/* <OrbitControls /> */}
                <CameraControls ref={controlsRef} />
                <ambientLight intensity={Math.PI / 2} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} decay={0} intensity={Math.PI} />
                <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} />
                
                <CourseOutline viewBox={settings.svgSize} color={0xdddd77} />
                {layers.map(layer => {
                  return [
                    <ShapeLayer opacity={0.5} key={`shape_${layer.id}`} polygon={layer.polygon} layer={layer} />,
                    // ...layer.holes.map((hole, index) => {
                    //   return <ShapeLayer
                    //      opacity={0.8}
                    //     key={`hole_${layer.id}_${index}`} layerId={`h${index}`} polygon={hole} layer={layer} />;
                    // }),
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
              {/* </Bounds> */}
                <SceneGrabber setScene={setScene} />
            </Canvas>
            {/* <div className="overlay">overlay 😍</div> */}
          </div>
        </Box>
      </Box>
      <ErrorDialog open={!!systemError} onClose={clearSystemError} systemError={systemError} />
      <LoadingDialog open={!!systemLoading} label={systemLoading} onClose={clearSystemLoading} />
      <ImportSettingsDialog open={isImportDialogOpen} onClose={handleImportDialogClose} />
    </>
  )
}