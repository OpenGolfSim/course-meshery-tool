import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  Avatar,
  Box,
  Button,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Slider,
  Stack,
  styled,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
  CircularProgress,
  Divider,
} from "@mui/material";
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
// import { Canvas, extend, useFrame } from '@react-three/fiber';
import { MapControls, CameraControls, Grid as ThreeGrid } from '@react-three/drei';
import * as THREE from 'three/webgpu';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { texture, uv, vec3, float, int, Fn } from 'three/tsl';
import { Accordion, AccordionDetails, AccordionHeader, AccordionSummary, SidebarAccordionGroup } from '../components/Accordion';
// import * as THREE from 'three';
import { useProject } from "../contexts/Project";
import CourseScene from '../fuse/CourseScene';
import GenerateMeshDialog from '../dialogs/GenerateMeshDialog';
import ExportCourseDialog from '../dialogs/ExportCourseDialog';
import { MiniTab, MiniTabPanel, MiniTabs } from '../components/MiniTabs';
import SurfaceSettings from '../components/SurfaceSettings.jsx';
import TreeLayerList from '../components/TreeLayerList.jsx';
import TreeLayerDialog from '../dialogs/TreeLayerDialog.jsx';
import NumberField from '../components/NumberField.jsx';
import TreeImportDialog from '../dialogs/TreeImportDialog.jsx';
import ColorField from '../components/ColorField.jsx';

// extend(THREE);

function SetCamera({ controlsRef }) {
  const [set, setSet] = useState(false);
  const { project } = useProject();

  const worldSize = useMemo(() => {
    return project.settings.distance * 1000;
  }, [project.settings.distance]);

  useEffect(() => {
    if (!controlsRef.current || set) return;
    controlsRef.current.setLookAt(
      worldSize - 50, (worldSize / 4), worldSize - 50,  // camera position
      worldSize / 2, 0, worldSize / 2,    // target
      false
    );
    setSet(true);
  }, [controlsRef.current, worldSize]);
  return null;
}

function TerrainMesh({ heightMap, heightScale, maxSegments = 1024, size = 1000 }) {
  
  const material = useMemo(() => {
    // const mat = new THREE.MeshStandardMaterial({
    //   color: '#909380',
    //   // map: texture,
    //   wireframe: false
    // });
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.colorNode = vec3(0.56, 0.58, 0.50);
    mat.side = THREE.DoubleSide;
    return mat;
  }, []);

  const geometry = useMemo(() => {
    if (!heightMap?.length) {
      console.warn('No heightmap!');
      return;
    }
    if (typeof heightScale !== 'number') return;   // wait for the real value
    console.time('build-mesh');


    // const resolution = Math.sqrt(heightMap.length);
    // const segments = Math.min(resolution - 1, maxSegments);
    // const step = resolution / (segments + 1);
    // const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    // geo.rotateX(-Math.PI / 2); // lay it flat
    // const pos = geo.attributes.position;
    // for (let z = 0; z <= segments; z++) {
    //   for (let x = 0; x <= segments; x++) {
    //     const srcX = Math.round(x * step);
    //     const srcZ = Math.round(z * step);
    //     const srcIdx = srcZ * resolution + srcX;
    //     const dstIdx = z * (segments + 1) + x;
    //     pos.setY(dstIdx, heightMap[srcIdx] / 65535 * heightScale);
    //   }
    // }
    // pos.needsUpdate = true;
    // geo.computeBoundingSphere();
    // geo.computeVertexNormals();
    console.timeEnd('build-mesh');
    return geo;
  }, [heightMap, heightScale]);

  // return null;
  return (
    <mesh
      geometry={geometry}
      material={material}
      raycast={() => null} 
      // events={undefined}
    />
  );
}

export default function Course() {
  const {
    project,
    setProjectSettings,
    updateSceneSettings,
    selectHDRI,
    updateLayerById,
    addTreeLayer,
    removeTreeLayer,
    updateTreeLayer,
    importTreeModel,
    removeTreeModel
  } = useProject();

  const [panelExpanded, setPanelExpanded] = useState('veg');
  const [skySettings, setSkySettings] = useState({ ...project?.scene?.sky || {} });
  const skySettingsInit = useRef(false);
  const [exportCourseData, setExportCourseData] = useState({ mapImage: null });
  // const [heightMap, setHeightMap] = useState(null);
  const [heightScale, setHeightScale] = useState(project.stats?.heightScale || project.stats?.relief);
  const [meshDataState, setMeshDataState] = useState(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [treeImportDialog, setTreeImportDialog] = useState(false);
  const [loading, setLoading] = useState(null);
  const [selectedLayer, setSelectedLayer] = useState(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [hiddenLayers, setHiddenLayers] = useState({});
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [treeEditDialog, setTreeEditDialog] = useState(null);

  // refs
  const courseSceneRef = useRef();
  const controlsRef = useRef();
  const lightTargetRef = useRef();

  // const heightMap = useRef();
  const worldSize = useMemo(() => {
    return project.settings.distance * 1000;
  }, [project.settings.distance]);

  const handleStateUpdate = (event, result) => {
    // console.log('handleStateUpdate', result);
    // setMeshDataState(result);
    // if (result.running) {
    //   setGenerateDialogOpen(true);
    // }
    console.log('[state] handleStateUpdate', result?.updatedLayerId, result);
    if (result.updatedLayerId) {
      // Single layer update — skip full rebuild
      courseSceneRef.current?.refreshLayer(result.updatedLayerId);
    } else {
      setMeshDataState(result);
      if (result.running) {
        setGenerateDialogOpen(true);
      }
    }

  }

  const sleep = (ms) => new Promise(resolve => requestAnimationFrame(resolve));
  const handleExport = async () => {
    setSelectedLayer(null);
    setExportDialogOpen(true);
    await sleep(200);
    // -- Capture course image here?
    // const mapImage = captureRef.current?.capture(4096);
    const mapImage = await courseSceneRef.current?.capture(4096);
    setExportCourseData(old => ({ ...old, mapImage }));
  }

  // const loadRawData = async (uri) => {
  //   const response = await fetch(uri);
  //   const buffer = await response.arrayBuffer();
  //   setHeightMap(new Uint16Array(buffer));   // triggers re-render
  // }


  useEffect(() => {
    const hs = project.stats?.heightScale || project.stats?.relief;
    if (typeof hs === 'undefined') {
      console.warn('No heightscale on stats!');
      return;
    }
    console.log(`Setting height scale to: ${hs}`);
    setHeightScale(hs);
  }, [project.stats]);

  const handleGenerateMeshes = () => {
    setGenerateDialogOpen(true);
  }
  const handleLayerSelect = (layer) => {
    console.log('layer', layer);
    if (layer) {
      setSelectedLayer({ type: 'layer', layer });
    } else {
      setSelectedLayer(null);
    }
  }
  
  const handleSaveSurface = useCallback(async () => {
    console.log('surface-changed', selectedLayer);
  }, [selectedLayer]);

  const handleTreeImportClosed = useCallback(async (plant) => {
    // TreeImportDialog
    if (plant) {
      console.log('Write import to settings', treeImportDialog, plant);
      await importTreeModel(treeImportDialog, plant);
      // await window.meshery.trees.importPlant(treeImportDialog, plant);
    }
    setTreeImportDialog(null);
  }, [treeImportDialog]);

  const handleTreeModelImport = async (treeLayerId) => {
    // await window.meshery.trees.import(treeLayer.id);
    // await importTreeModel(treeLayerId);
    setTreeImportDialog(treeLayerId);
  }
  const handleTreeModelRemove = async (treeLayerId, treeConfigId) => {
    // window.meshery.trees.remove(treeLayerId, treeConfigId)    
    await removeTreeModel(treeLayerId, treeConfigId);
  }

  const handleTreeEdit = (treeLayer) => {
    setTreeEditDialog(treeLayer);
  }
  const handleTreeSave = useCallback(async (treeLayer) => {
    if (treeEditDialog?.id) {
      await updateTreeLayer(treeEditDialog.id, treeLayer);
    }
    setTreeEditDialog(null);
  }, [treeEditDialog]);

  const handleTreeRemove = (treeLayer) => {
    // console.log('treeLayer', treeLayer);
    removeTreeLayer(treeLayer.id);
  }
  const handleTreeAdd = useCallback(async () => {
    await addTreeLayer();
  }, [project.trees]);  

  const handleTreeConfigChange = useCallback((key, value) => {
    if (key === 'scaleRange') {
      value = { min: value[0], max: value[1] };
      console.log('scale change', value);
    }
    setSelectedLayer(prev => {
      return {
        ...prev,
        config: {
          ...prev.config,
          [key]: value
        }
      }
    });
    console.log('change', key, value);
  }, [selectedLayer]);

  const handleSaveTreeConfig = useCallback(async () => {
    console.log('tree-changes', selectedLayer);
    const updatedLayer = { ...selectedLayer.layer };
    updatedLayer.treeConfigs = updatedLayer.treeConfigs.map(config => {
      if (config.id === selectedLayer.config.id) {
        return { ...config, ...selectedLayer.config };
      }
      return config;
    });
    console.log('updatedLayer', updatedLayer);
    await updateTreeLayer(selectedLayer.layer.id, updatedLayer);

    // updateTreeLayer
  }, [selectedLayer]);

  const handleSkyTypeChange = useCallback((event) => {
    const type = event.target.value;
    console.log('change sky type...', type);
    setSkySettings(old => ({ ...old, type }))
  }, []);

  const handleSelectHDRI = useCallback(async () => {
    const sceneUpdate = await selectHDRI();
    if (sceneUpdate.sky) {
      setSkySettings(old => ({ ...old, ...sceneUpdate.sky }))
    }
  }, []);

  const handleCloudSettingsChange = useCallback((key, newValue) => {
    setSkySettings(old => ({ ...old, clouds: { ...old.clouds, [key]: newValue } }))
  }, []);
  
  useEffect(() => {
    if (!skySettingsInit.current) {
      skySettingsInit.current = true;
      return;
    }
    console.log('sky Settings-changed', skySettings);
    updateSceneSettings({ sky: skySettings });
  }, [skySettings]);

  useEffect(() => {
    console.log(`${Date.now()} - CourseMap init effect`);
    
    // window.meshery.project.getHeightMap().then(result => {
    //   console.log(`${Date.now()} - getHeightMap resolved (${result?.data?.length} entries)`);
    //   setHeightMap(result);
    // });

    window.meshery.project.getMeshDataState().then(result => {
      console.log(`${Date.now()} - getMeshDataState resolved`);
      handleStateUpdate(null, result);
    });

    window.meshery.on('mesh.data', handleStateUpdate);
    
    return () => {
      window.meshery.off('mesh.data', handleStateUpdate);
    };
  }, []);  
  // useEffect(() => {
  //   window.meshery.project.getHeightMap().then(result => {
  //     setHeightMap(result);
  //   });

  //   window.meshery.project.getMeshDataState().then(result => {
  //     console.log('res', result);
  //     handleStateUpdate(null, result);
  //   });

  //   window.meshery.on('mesh.data', handleStateUpdate);
    
  //   return () => {
  //     window.meshery.off('mesh.data', handleStateUpdate);
  //   };
  // }, []);
  
  return (
    <React.Fragment>
      <Box
        sx={theme => ({
          display: 'flex',
          flexDirection: 'row',
          flexGrow: 1,
          flexShrink: 1,
          height: '100%',
          maxHeight: '100%',
          minWidth: 0
        })}
      >
        <Box sx={{ width: 220, flexGrow: 0, flexShrink: 0, display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>
          
          <Stack sx={{ p: 3 }} spacing={3}>

            <Button
              onClick={handleGenerateMeshes}
              fullWidth
              variant="contained"
              color={!meshDataState?.generated || !project._layers?.length ? 'primary' : 'inherit'}
            >
              {!meshDataState?.generated || !project._layers?.length ? 'Generate' : 'Regenerate'} Meshes
            </Button>

            <Button
              disabled={!project._layers?.length}
              color={!project._layers?.length ? 'inherit' : 'primary'}
              onClick={handleExport}
              fullWidth={true}
              variant="contained"
            >
              Export Course
            </Button>

          </Stack>


          <Box sx={{ mt: 2, flexGrow: 1, overflow: 'hidden', height: '80%', display: 'flex', flexDirection: 'column' }}>
            <SidebarAccordionGroup>
              <Accordion expanded={panelExpanded === 'veg'} onChange={(e, expanded) => setPanelExpanded(expanded ? 'veg' : null)}>
                <AccordionSummary id="veg-header">
                  <AccordionHeader sx={{ flex: 1, alignContent: 'center' }} variant="h5" color="textSecondary">Planting</AccordionHeader>
                </AccordionSummary>
                <AccordionDetails>
                  <TreeLayerList
                    trees={project?.trees}
                    selectedTree={selectedLayer?.config?.id}
                    onEdit={handleTreeEdit}
                    onRemove={handleTreeRemove}
                    onImportModel={handleTreeModelImport}
                    onRemoveModel={handleTreeModelRemove}
                    onTreeSelect={(layer, config) => setSelectedLayer({ type: 'tree', layer, config })}
                  />
                  <Box sx={{ p: 2 }}>
                    <Button fullWidth onClick={handleTreeAdd} color="secondary" variant="contained">Add Planting Layer</Button>
                  </Box>
                </AccordionDetails>
              </Accordion>

              <Accordion expanded={panelExpanded === 'sky'} onChange={(e, expanded) => setPanelExpanded(expanded ? 'sky' : null)}>
                <AccordionSummary id="course-area-header">
                  <AccordionHeader sx={{ flex: 1, alignContent: 'center' }} variant="h5" color="textSecondary">Sky &amp; Environment</AccordionHeader>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 2 }}>
                  <Stack spacing={3}>
                    <TextField
                      select={true}
                      fullWidth={true}
                      value={skySettings.type}
                      size="small"
                      label="Sky"
                      onChange={handleSkyTypeChange}
                    >
                      <MenuItem value="clouds">Clouds</MenuItem>
                      <MenuItem value="hdri">Skybox / HDRI</MenuItem>
                    </TextField>

                    {skySettings.type === 'hdri' ? (
                      <React.Fragment>
                        {skySettings.hdri?.name ? (
                          <Typography>{skySettings.hdri?.name}</Typography>
                        ) : null}
                        <Button variant="contained" color="secondary" fullWidth onClick={handleSelectHDRI}>Select HDRI</Button>
                      </React.Fragment>
                    ) : null}

                    {skySettings.type === 'clouds' ? (
                      <React.Fragment>
                        <NumberField
                          label="Density"
                          fullWidth={true}
                          size="small"
                          min={0}
                          max={2}
                          step={0.05}
                          onChange={(newValue) => handleCloudSettingsChange('density', newValue)}
                          value={skySettings.clouds.density}
                        />
    
                        <ColorField
                          label="Cloud Color"
                          onChange={(newValue) => handleCloudSettingsChange('cloudColor', newValue)}
                          value={skySettings.clouds.cloudColor}
                        />
                      </React.Fragment>
                    ) : null}
                    
                    <Divider />
                    <ColorField
                      label="Sky Color"
                      onChange={(newValue) => handleCloudSettingsChange('skyColor', newValue)}
                      value={skySettings.clouds.skyColor}
                    />
                    <ColorField
                      label="Fog Color"
                      onChange={(newValue) => handleCloudSettingsChange('fogColor', newValue)}
                      value={skySettings.clouds.fogColor}
                    />

                  </Stack>
                </AccordionDetails>
              </Accordion>

            </SidebarAccordionGroup> 
          </Box>

        </Box>
        <Box sx={{ flex: 1, backgroundColor: 'black', position: 'relative', minWidth: 0, overflow: 'hidden' }}>
          {/* <CourseScene meshDataState={meshDataState} worldSize={worldSize} /> */}
          {/* <CourseScene meshDataState={meshDataState} heightMap={heightMap} worldSize={worldSize} /> */}
         <CourseScene
           meshDataState={meshDataState}
           ref={courseSceneRef}
           skySettings={skySettings}
           worldSize={worldSize}
           selectedLayer={selectedLayer}
           onSelect={handleLayerSelect}
           onLoadingChange={setLoading}
         />

         {loading && loading.phase !== 'ready' && (
           <Stack
             direction="row"
             spacing={1.5}
             alignItems="center"
             sx={{
               position: 'absolute',
               top: 16,
               left: 16,
               bgcolor: 'rgba(0,0,0,0.7)',
               color: 'white',
               px: 2,
               py: 1,
               borderRadius: 1,
             }}
           >
             <CircularProgress size={16} color="inherit" />
             <Typography variant="body2">
               {loading.phase === 'surfaces'
                 ? `Loading surfaces… ${loading.loaded}/${loading.total}`
                 : `Planting trees… ${loading.loaded}/${loading.total}`}
             </Typography>
           </Stack>
         )}


          {selectedLayer ? (
            <Paper
              elevation={4}
              sx={theme => ({
                position: "absolute",
                top: theme.spacing(1),
                right: theme.spacing(1),
                minWidth: 180,
                maxWidth: 200,
                pointerEvents: "auto",
              })}
            >
              {selectedLayer.type === 'tree' ? (
                <>
                  <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <MiniTabs value={selectedTab} onChange={(e,num) => setSelectedTab(num)} variant="fullWidth">
                      <MiniTab label="Tree Properties" />
                    </MiniTabs>
                  </Box>
                  <MiniTabPanel value={selectedTab} index={0}>
                    <Stack spacing={3}>
                      <Typography sx={{ mb: 3 }}>{selectedLayer.config.name}</Typography>

                      <NumberField
                        label="Density"
                        size="small"
                        min={0.01}
                        max={1}
                        step={0.01}
                        value={selectedLayer.config.density}
                        onChange={(event, val) => handleTreeConfigChange('density', event)}
                      />
                      <Box>
                        <Typography variant="caption">Scale Range</Typography>
                        <Slider
                          label={'Scale Range'}
                          min={0.05}
                          max={5}
                          step={0.05}
                          valueLabelDisplay="auto"
                          marks={[{ value: 0.05, label: '0x' }, { value: 5, label: '5x' }]}
                          // marks={true}
                          value={[selectedLayer.config.scaleRange.min, selectedLayer.config.scaleRange.max]}
                          onChange={(event, val) => handleTreeConfigChange('scaleRange', val)}
                          // onChange={handleChange}
                          // valueLabelDisplay="auto"
                          // getAriaValueText={valuetext}
                        />    
                      </Box>
                      <Button variant="contained" onClick={handleSaveTreeConfig}>Save Changes</Button>                    
                    </Stack>
                  </MiniTabPanel>
                </>
              ) : null}
              {selectedLayer.type === 'layer' ? (
                <>
                  <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <MiniTabs value={selectedTab} onChange={(e,num) => setSelectedTab(num)} variant="fullWidth">
                      <MiniTab label="Mesh" />
                      <MiniTab label="Material" />
                    </MiniTabs>
                  </Box>
                  <MiniTabPanel value={selectedTab} index={0}>
                    <Stack direction="row" alignItems="center">
                      <Stack flex={1} direction="row" alignItems="center" spacing={1}>
                        <Avatar
                          sx={{ backgroundColor: `#${selectedLayer.layer?.color}`, width: 15, height: 15 }}
                          slotProps={{ root: { title: selectedLayer.layer?.surface }}}
                        >{' '}</Avatar>
                        <Box>
                          <Typography component="div">
                            {selectedLayer.layer?.name}
                          </Typography>
                        </Box>
                      </Stack>
                      <IconButton onClick={(e) => handleLayerZoom(e, selectedLayer.layer)} size="small"><ZoomInIcon /></IconButton>
                      <IconButton onClick={(e) => handleShowHide(e, selectedLayer.layer)} size="small">
                        {!hiddenLayers?.[selectedLayer.layer?.id] ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </Stack>
                  
                    <Box sx={{ mt: 3 }}>
                      <SurfaceSettings
                        disabled={!meshDataState.generated}
                        key={selectedLayer?.layer.id}
                        layer={selectedLayer?.layer}
                        visible={!hiddenLayers?.[selectedLayer?.layer?.id]}
                        onSave={handleSaveSurface}
                      />
                    </Box>
                  </MiniTabPanel>
                  <MiniTabPanel value={selectedTab} index={1}>
                    <Typography>material settings</Typography>
                  </MiniTabPanel>
                </>
              ) : null}
              </Paper>
          ) : null}

        </Box>
      </Box>

      <TreeLayerDialog
        open={Boolean(treeEditDialog)}
        tree={treeEditDialog}
        onSave={handleTreeSave}
        onClose={() => setTreeEditDialog(null)}
      />
      <TreeImportDialog
        open={Boolean(treeImportDialog)}
        onClose={handleTreeImportClosed}
      />
      <GenerateMeshDialog open={generateDialogOpen} onClose={() => setGenerateDialogOpen(false)} />     
      <ExportCourseDialog data={exportCourseData} open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} />
   </React.Fragment>
  );
}