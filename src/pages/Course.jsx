import React, { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
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
  Stack,
  styled,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import ImportIcon from '@mui/icons-material/FileOpen';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LayerIcon from '@mui/icons-material/Layers';
import TreeIcon from '@mui/icons-material/Park';
import { useProject } from '../contexts/Project';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Shape,
  Grid as ThreeGrid,
  Line,
  Bounds,
  CameraControls,
  useBounds,
  useGLTF,
  Sky,
  Html
} from '@react-three/drei';
import { Accordion, AccordionDetails, AccordionHeader, AccordionSummary, SidebarAccordionGroup } from '../components/Accordion';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CourseOutline from '../components/CourseOutline.jsx';
import SurfaceSettings from '../components/SurfaceSettings.jsx';
import GenerateMeshDialog from '../dialogs/GenerateMeshDialog.jsx';
import CustomMesh from '../components/CustomMesh.jsx';
import ExportCourseDialog from '../dialogs/ExportCourseDialog.jsx';
import { RESOURCES_FILE_PROTOCOL } from '../constants.js';
import CustomListItem from '../components/CustomListItem.jsx';
import TreeLayerDialog from '../dialogs/TreeLayerDialog.jsx';
import TreePreview from '../components/TreePreview.jsx';
import SkyPreview from '../components/SkyPreview.jsx';
import NumberField from '../components/NumberField.jsx';
import ColorField from '../components/ColorField.jsx';
import TreeLayerList from '../components/TreeLayerList.jsx';
import CourseMapCapture from '../components/CourseMapCapture.jsx';

const MiniTabs = styled(props => <Tabs {...props} />)(theme => ({
  height: 32,
  minHeight: 32,
  // Adjusts the overall container height
  "&.MuiTabs-root": { minHeight: 32, height: 32 },
  // Adjusts the individual tab clickable area
  "& .MuiTab-root": { minHeight: 32, height: 32 },
}));

const MiniTab = styled(props => <Tab disableRipple {...props} />)(theme => ({
  // padding: '1px 3px',
  // minHeight: 32,
  // '& .MuiTabs-root': {
  //   minHeight: 32,
  //   height: 32,
  // }
}));

function MiniTabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`mini-tabpanel-${index}`}
      aria-labelledby={`mini-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}


// Helper inside Canvas
function SceneGrabber({ setScene }) {
  const { scene } = useThree();
  useEffect(() => {
    setScene(scene);
  }, [scene]);
  return null;
}


function ImportedModel({ url, ...rest }) {
  const { scene } = useGLTF(url)
  // scene.traverse(child => {
  //   console.log('scene-child', child);
  // });
  return <primitive object={scene} {...rest} />
}

function SetCamera({ controlsRef, worldSize }) {
  const [set, setSet] = useState(false);
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

export default function Course() {
  const {
    project,
    setProjectSettings,
    updateSceneSettings,
    updateLayerById,
    addTreeLayer,
    removeTreeLayer,
    updateTreeLayer,
    importTreeModel,
    removeTreeModel
  } = useProject();
  const [panelExpanded, setPanelExpanded] = useState('veg');
  const controlsRef = useRef();
  const groundRef = useRef();
  const lightTargetRef = useRef();
  const captureRef = useRef();

  const [scene, setScene] = useState();
  const [visibilityMenu, setVisibilityMenu] = useState();
  const [selectedLayer, setSelectedLayer] = useState();
  const [selectedTab, setSelectedTab] = useState(0);

  const [skySettings, setSkySettings] = useState({ ...project?.scene?.sky || {} });
  const skySettingsInit = useRef(false);

  const [renderSettings, setRenderSettings] = useState({ wireframe: false, vertex: false });
  const selectedMeshRef = useRef();
  const meshRefs = useRef(new Map());
  const [treeEditDialog, setTreeEditDialog] = useState(null);
  const [layers, setLayers] = useState([]);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportCourseData, setExportCourseData] = useState({ mapImage: null });
  const [meshDataState, setMeshDataState] = useState(null);
  const [hiddenLayers, setHiddenLayers] = useState({});

  const worldSize = useMemo(() => {
    return project.settings.distance * 1000;
  }, [project.settings.distance]);
  
  const registerMeshRef = useCallback((id, node) => {
    if (node) {
      meshRefs.current.set(id, node);
    } else {
      meshRefs.current.delete(id); // cleanup on unmount
    }
  }, []);


  const zoomToObject = (mesh) => {
    if (!controlsRef.current) return;
    const box = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    box.getCenter(center);  // center in world coordinates
    // Move above the object center
    controlsRef.current.setLookAt(
      center.x, center.y + 20, center.z,     // camera position
      center.x, center.y, center.z,          // look at this position
      true                                   // animate: true/false as needed
    );
    controlsRef.current.fitToBox(mesh, true);
  }
  
  const handleCanvasClick = useCallback((e) => {
    setSelectedLayer(null);
  }, []);

  const handleMeshClick = useCallback((layer, e) => {
    setSelectedLayer({ type: 'layer', layer: layer, object: e.object });
    return false;
  }, []);
  
  const handleMeshDoubleClick = useCallback((layer, e) => {
    setSelectedLayer({ type: 'layer', layer: layer, object: e.object });
    zoomToObject(e.object);
  }, []);

  const handleLayerZoom = useCallback((e, layer) => {
    const mesh = meshRefs.current.get(layer?.id);
    if (!mesh) return;
    zoomToObject(mesh);
  }, []);

  const handleShowHide = useCallback((e, layer) => {
    setHiddenLayers(old => ({ ...old, [layer.id]: old?.[layer.id] ? false : true }));
  }, []);

  const handleSpacingChange = useCallback((newValue) => {
    // setSelectedLayer(old => ({ ...old, layer: { ...old.layer, spacing: newValue }}))
  }, [selectedLayer]);
  
  const handleCloudSettingsChange = useCallback((key, newValue) => {
    setSkySettings(old => ({ ...old, clouds: { ...old.clouds, [key]: newValue } }))
  }, [skySettings]);
  
  const handleExport = () => {
    // -- Capture course image here?
    const mapImage = captureRef.current?.capture(4096);
    setExportCourseData(old => ({ ...old, mapImage }));
    setExportDialogOpen(true);
  }
  const handleGenerateMeshes = () => {
    setGenerateDialogOpen(true);
  }

  const handleTreeModelImport = async (treeLayerId) => {
    // await window.meshery.trees.import(treeLayer.id);
    await importTreeModel(treeLayerId);
  }
  const handleTreeModelRemove = async (treeLayerId, treeConfigId) => {
    // window.meshery.trees.remove(treeLayerId, treeConfigId)    
    await removeTreeModel(treeLayerId, treeConfigId);
  }

  const handleTreeEdit = (treeLayer) => {
    setTreeEditDialog(treeLayer);
  }
  const handleTreeSave = useCallback((treeLayer) => {
    if (treeEditDialog?.id) {
      updateTreeLayer(treeEditDialog.id, treeLayer);
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
  const handleTreeConfigChange = useCallback((val) => {
    console.log('change', val, selectedLayer);
  }, [selectedLayer]);

  const handleSaveChanges = (changes) => {
    console.log('changes', changes);
  }

  const handleStateUpdate = (event, result) => {
    console.log('handleStateUpdate', result);
    setMeshDataState(result);
    if (result.running) {
      setGenerateDialogOpen(true);
    }
  }


  useEffect(() => {
    if (!skySettingsInit.current) {
      skySettingsInit.current = true;
      return;
    }
    console.log('skySettings-changed', skySettings);
    updateSceneSettings({ sky: skySettings });
  }, [skySettings]);

  useEffect(() => {
    window.meshery.project.getMeshDataState().then(result => {
      console.log('res', result);
      handleStateUpdate(null, result);
    });

    window.meshery.on('mesh.data', handleStateUpdate);
    return () => {
      window.meshery.off('mesh.data', handleStateUpdate);
    }
  }, []);

  if (!project._layers?.length) {
    return (
      <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="textSecondary">No SVG layers detected yet</Typography>
      </Box>
    );
  }

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
              disabled={!meshDataState?.generated || !project._layers?.length}
              color={!meshDataState?.generated || !project._layers?.length ? 'inherit' : 'primary'}
              onClick={handleExport}
              fullWidth={true}
              variant="contained"
            >
              Export Course
            </Button>

            <Button
              onClick={handleGenerateMeshes}
              fullWidth
              variant="contained"
              color={!meshDataState?.generated || !project._layers?.length ? 'primary' : 'inherit'}
            >
              {!meshDataState?.generated || !project._layers?.length ? 'Generate' : 'Regenerate'} Meshes
            </Button>

          </Stack>

          <Box sx={{ mt: 2, flexGrow: 1, overflow: 'hidden', height: '80%', display: 'flex', flexDirection: 'column' }}>
            <SidebarAccordionGroup>


              <Accordion expanded={panelExpanded === 'veg'} onChange={(e, expanded) => setPanelExpanded(expanded ? 'veg' : null)}>
                <AccordionSummary id="veg-header">
                  <AccordionHeader sx={{ flex: 1, alignContent: 'center' }} variant="h5" color="textSecondary">Trees &amp; Vegetation</AccordionHeader>
                </AccordionSummary>
                <AccordionDetails>
                  <TreeLayerList
                    trees={project?.trees}
                    selectedTree={selectedLayer?.config?.id}
                    onEdit={handleTreeEdit}
                    onRemove={handleTreeRemove}
                    onImportModel={handleTreeModelImport}
                    onRemoveModel={handleTreeModelRemove}
                    onTreeSelect={(config) => setSelectedLayer({ type: 'tree', config })}
                  />
                  <Box sx={{ p: 2 }}>
                    <Button fullWidth onClick={handleTreeAdd} color="secondary" variant="contained">Add Layer</Button>
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
                    >
                      <MenuItem value="clouds">Clouds</MenuItem>
                      <MenuItem value="box">SkyBox</MenuItem>
                    </TextField>

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
                      label="Sky Color"
                      // onChange={(newValue) => console.log('skyColor', newValue)}
                      onChange={(newValue) => handleCloudSettingsChange('skyColor', newValue)}
                      value={skySettings.clouds.skyColor}
                    />
                    <ColorField
                      label="Cloud Color"
                      onChange={(newValue) => handleCloudSettingsChange('cloudColor', newValue)}
                      value={skySettings.clouds.cloudColor}
                    />
                    <ColorField
                      label="Fog Color"
                      onChange={(newValue) => handleCloudSettingsChange('fogColor', newValue)}
                      value={skySettings.clouds.fogColor}
                    />
                  </Stack>
                </AccordionDetails>
              </Accordion>


              {/* <Accordion expanded={panelExpanded === 'models'} onChange={(e, expanded) => setPanelExpanded(expanded ? 'models' : null)}>
                <AccordionSummary id="model-header">
                  <AccordionHeader sx={{ flex: 1, alignContent: 'center' }} variant="h5" color="textSecondary">Models</AccordionHeader>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 2 }}>
                  <Button color="secondary" variant="contained" fullWidth>Import Model</Button>
                </AccordionDetails>
              </Accordion> */}

              <Accordion expanded={panelExpanded === 'scene'} onChange={(e, expanded) => setPanelExpanded(expanded ? 'scene' : null)}>
                <AccordionSummary id="course-area-header">
                  <AccordionHeader sx={{ flex: 1, alignContent: 'center' }} variant="h5" color="textSecondary">Editor</AccordionHeader>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack sx={{ px: 4, py: 2 }} spacing={2}>
                    <FormControlLabel
                      label="Wireframe"
                      control={<Switch size="small" checked={renderSettings.wireframe} onChange={(e) => setRenderSettings(old => ({ ...old, wireframe: e.target.checked }))} />}
                    />
                    <FormControlLabel
                      label="Vertex Shading"
                      control={<Switch size="small" checked={renderSettings.vertex} onChange={(e) => setRenderSettings(old => ({ ...old, vertex: e.target.checked }))} />}
                    />
                  </Stack>
                </AccordionDetails>
              </Accordion>

            </SidebarAccordionGroup>
                        
          </Box>
        </Box>
        <Box sx={{ flex: 1, backgroundColor: 'black', position: 'relative', minWidth: 0, overflow: 'hidden' }}>

          <Canvas
            camera={{ fov: 50, near: 0.5, far: 3000 }}
            onPointerMissed={handleCanvasClick}
            onCreated={({ scene }) => {
              // scene.fog = new THREE.Fog(fogColor, 100, 800);
              // scene.fog = new THREE.Fog('#fff7e0', 100, 800); 
            }}            
          >
            <color attach="background" args={[skySettings.clouds.skyColor]} />
            <CameraControls
              ref={controlsRef}
              dollyToCursor={true}
              minDistance={1}
              maxDistance={2000}
              dollySpeed={0.5}
            />
            <SetCamera controlsRef={controlsRef} worldSize={worldSize} />

            <ambientLight intensity={0.8} />
            <group position={[500, 0, 500]} ref={lightTargetRef} />
            <directionalLight
              color={0xffffff}
              position={[worldSize/2, 800, worldSize/2]}
              intensity={1.1}
              shadow={{
                mapSize: { width: 2048, height: 2048 },
                camera: {
                  near: 1,
                  far: 700,
                  left: -500,
                  right: 500,
                  top: 500,
                  bottom: -500
                }
              }}
              target={lightTargetRef.current}
              castShadow={true}
            />
            
            {/* Places a colored outline around the square course bounds */}
            <CourseOutline color={0xdddd77} />
            
            <SkyPreview
              density={skySettings.clouds.density}
              skyColor={skySettings.clouds.skyColor}
              fogColor={skySettings.clouds.fogColor}
              cloudColor={skySettings.clouds.cloudColor}
            />


            {project._meshes?.map(layer => {
              return [
                <CustomMesh
                  key={layer.id}
                  registerRef={registerMeshRef}
                  layer={layer}
                  visible={!hiddenLayers?.[layer.id]}
                  meshDataState={meshDataState}
                  renderSettings={renderSettings}
                  selectedLayer={selectedLayer}
                  onDoubleClick={(e) => handleMeshDoubleClick(layer, e)}
                  onClick={(e) => handleMeshClick(layer, e)}
                />
              ]
            })}

            <Suspense fallback={null}>
              {project.trees?.length ? project.trees.map((treeLayer) => (
                <TreePreview
                  key={treeLayer.id}
                  worldSize={worldSize}
                  // groundRef={groundRef}
                  heightMap={project._heightMap}
                  heightScale={project._heightMap?.heightScale || project.stats.relief}
                  positions={treeLayer.positions}
                  trees={treeLayer.treeConfigs}
                  seed={treeLayer.randomSeed}
                />
              )) : null}
            </Suspense>

            {/* <ImportedModel
              url={`${RESOURCES_FILE_PROTOCOL}://models/FlagStick.glb`}
              position={[0, 0, 0]}
            /> */}
            
            <ThreeGrid
              position={[worldSize / 2, 0, worldSize / 2]}
              // followCamera={true}
              cellSize={10}
              sectionSize={100}
              infiniteGrid={true}
              fadeDistance={1500}
              sectionThickness={2}
              sectionColor={0x444444}
            />

            <SceneGrabber setScene={setScene} />
            <CourseMapCapture captureRef={captureRef} worldSize={worldSize} />
          </Canvas>
          
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
                    <Box>
                      <NumberField min={0.01} max={1} step={0.01} onChange={(event, val) => handleTreeConfigChange(val)} />
                    </Box>
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
                        onSave={handleSaveChanges}
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
      <GenerateMeshDialog open={generateDialogOpen} onClose={() => setGenerateDialogOpen(false)} />
      <ExportCourseDialog data={exportCourseData} open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} />
    </React.Fragment>
  )
}