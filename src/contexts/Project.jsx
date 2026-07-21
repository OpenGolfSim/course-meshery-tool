import React, { useState, useRef, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import logger from 'electron-log/renderer';

const log = logger.scope('RENDERER');
const CONCURRENT_JOBS = 6;

// Create the context with a default value (e.g., 'light')
const ProjectContext = createContext({
  // settings: { centerPoint: null, distance: 1 },
  project: null,
  // setProject: () => {},
  generateHillShade: () => {},
  generateSatellite: () => {},
  generateTerrainData: () => {},
  setProjectSettings: () => {},
  updateSceneSettings: () => {},
  selectHDRI: () => {},
  addHole: () => {},
  removeHole: () => {},
  editHole: () => {},
  handleDownloadCourse: () => {},
  createProject: () => {},
  updateLayerById: () => {},
  addTreeLayer: () => {},
  updateTreeLayer: () => {},
  removeTreeLayer: () => {},
  importTreeModel: () => {},
  removeTreeModel: () => {},
  generateMeshes: () => {},
  lidarSources: null,
  lidarFile: null,
  palette: null
});

// Create a custom hook to easily consume the context
export const useProject = () => useContext(ProjectContext);

function getNextAvailableHole(holesMap) {
  for (let i = 1; i <= 18; i++) {
    if (!holesMap.has(i)) return i;
  }
  return null; // all 18 holes filled
}

export const ProjectProvider = ({ children }) => {
  const [isPending, setIsPending] = useState(true);
  const [lidarSources, setLidarSources] = useState(null);
  const [project, setProject] = useState(null);
  const [palette, setPalette] = useState(null);
  const [meshLayers, setMeshLayers] = useState([]);
  const meshJobMap = useRef({});
  const initProject = useRef(false);
  const treesInitialized = useRef(false);
  const settingsInitialized = useRef(false);

  // set externally
  const setProjectSettings = async (update) => {
    console.log('[PROJECT] setProjectSettings-pre', update);
    const updated = await window.meshery.project.storeSettings(update);
    console.log('[PROJECT] setProjectSettings-post', updated);
    setProject((old) => ({ ...old, settings: { ...old.settings, ...updated.settings } }))
  }
  const updateSceneSettings = async (update) => {
    const updatedScene = await window.meshery.project.updateScene(update);
    setProject((old) => ({ ...old, scene: updatedScene }))
  }
  const selectHDRI = async () => {
    const updatedScene = await window.meshery.project.selectHDRI();
    console.log('selected new HDRI', updatedScene);
    setProject((old) => {
      console.log('old.scene', old.scene);
      console.log('updated', updatedScene);
      return { ...old, scene: updatedScene };
    });
    return updatedScene;
  }
  
  const getOpenProject = async () => {
    const data = await window.meshery.project.getOpenProject();
    console.log('getOpenProject: ', data);
    data.holes = new Map(data.holes);
    setProject(data);
  }

  const startWorkerJob = (jobId, payload) => {
    if (meshJobMap?.[jobId]?.promise) {
      console.log(`cancel existing job: ${jobId}`);
      meshJobMap[jobId].worker?.terminate();
      meshJobMap[jobId].reject('canceled');
      meshJobMap[jobId] = undefined;
    }

    const { promise, resolve, reject } = Promise.withResolvers();
    const worker = new MeshWorker();

    meshJobMap[jobId] = {
      worker,
      promise,
      resolve,
      reject
    };
    
    worker.addEventListener('message', handleWorkerMessage);
    worker.addEventListener('error', handleWorkerError);
    worker.postMessage({ ...payload, jobId });

    return promise;
  }

  const refreshLidarSources = async () => {
    const data = await window.meshery.map.lidarSources();
    setLidarSources(data);
  }

  const handleProjectChanged = (_event, updatedProject, clear) => {
    console.log('[PROJECT] updated', updatedProject);
    // prevents re-saving the state
    settingsInitialized.current = false;
    updatedProject.holes = new Map(updatedProject.holes);
    setProject(updatedProject);
  }

  const handleDownloadCourse = async (feature, coords) => {
    if (feature.type === 'dem') {
      const res = await window.meshery.imagery.downloadDEM(coords);
      setProject(old => ({
        ...old,
        dem: res.dem,
        raw: res.raw,
        stats: res.stats
      }));
      return;
    }

    const res = await window.meshery.lidar.downloadCourse(feature, coords);
    console.log('[PROJECT] handleDownloadCourse', res);
    setProject(old => ({
      ...old,
      lidar: res.lidar,
      dem: res.dem,
      raw: res.raw,
      stats: res.stats
    }));
  }

  const generateHillShade = async () => {
    const result = await window.meshery.imagery.hillShade();
    console.log('[PROJECT] generateHillShade', result);
    if (result) {
      setProject(old => ({ ...old, hillShade: result.hillShade }));
    }
  }

  const generateSatellite = async (source) => {
    const result = await window.meshery.imagery.satellite(source);
    console.log('[PROJECT] generateSatellite', result);
    if (result) {
      setProject(old => ({ ...old, ...result }));
    }
    return result?.satellite;
  }
  
  const createProject = async () => {
    const result = await window.meshery.project.createProject();
    console.log('[PROJECT] createProject', result);
    if (result) {
      setProject(old => ({ ...old, ...result }));
    }
  }
  
  const importTreeModel = async (treeLayerId, plant) => {
    if (plant) {
      const updated = await window.meshery.trees.importPlant(treeLayerId, plant);
      if (updated) {
        setProject((old) => ({ ...old, trees: updated }))
      }
    }
    
    // const updatedTrees = await window.meshery.trees.import(treeLayerId);
    // if (updatedTrees) {
    //   setProject((old) => ({ ...old, trees: updatedTrees }))
    // }
  }
  
  const removeTreeModel = async (treeLayerId, treeConfigId) => {
    const res = await window.meshery.trees.remove(treeLayerId, treeConfigId);
    console.log('remove-res', res);
    if (res?.trees) {
      setProject((old) => ({ ...old, trees: res.trees }))
    }
  }
  const addTreeLayer = async () => {
    const res = await window.meshery.trees.addLayer();
    if (res) {
      setProject((old) => ({ ...old, trees: res.trees }))
    }
  };
  
  const removeTreeLayer = async (layerId) => {
    console.log('[PROJECT] treeToRemove', layerId);
    const confirmed = await window.meshery.dialog.confirm({ message: 'Are you sure you want to remove this layer?' });
    if (confirmed) {
      const res = await window.meshery.trees.removeLayer(layerId);
      if (res) {
        setProject((old) => ({ ...old, trees: res.trees }))
      }
    }
  };
  
  const updateTreeLayer = async (layerId, layerUpdate) => {
    console.log('layerId, layerUpdate', layerId, layerUpdate);
    const res = await window.meshery.trees.updateLayer(layerId, layerUpdate);
    if (res) {
      setProject((old) => ({ ...old, trees: res.trees }))
    }
  };
  
  const generateMeshes = async (layerSettings, terrainSettings) => {
    const result = await window.meshery.project.generateMeshes(layerSettings, terrainSettings);
    console.log('Done generating meshes!', result);
    const { _meshes, ...rest } = result;
    setProject((old) => ({ ...old, _meshes }));
    return rest;
  }

  const saveTerrainData = async (terrainData, heightScale) => {
    // const res = await window.meshery.trees.addLayer();
    const res = await window.meshery.terrain.saveHeightMap(heightMap.current, heightScale);
    // console.log('remove-res', res);
    if (res) {
      setProject((old) => ({ ...old, stats: res.stats, raw: res.raw }))
    }
  }
  const generateTerrainData = async (terrainType) => {
    const res = await window.meshery.terrain.generate(terrainType);
    if (res) {
      setProject((old) => ({ ...old, stats: res.stats, raw: res.raw }))
    }
  }

  const updateLayerById = (layerId, update) => {
    return window.meshery.project.updateLayerById(layerId, update);
  }

  const editHole = (holeNumber, update) => {
    if (!holeNumber) { // should be >= 1
      console.error('Missing hole number');
      return;
    }
    console.log('[PROJECT] editHole', holeNumber, update);
    return window.meshery.project.updateHoleByNumber(holeNumber, update);
  }

  const removeHole = useCallback((holeNumber) => {
    return window.meshery.project.updateHoleByNumber(holeNumber, null);
  }, []);

  const addHole = useCallback(() => {
    console.log('[PROJECT] addHole', project?.holes);
    if (!project?.holes) {
      throw new Error('Hole map not created');
    }
    const number = getNextAvailableHole(project.holes);
    if (!number) {
      throw new Error('Too many holes');
    }
    return window.meshery.project.updateHoleByNumber(number, {
      number,
      par: 3,
      tee: null,
      hole: null,
      aim: null      
    });

  }, [project?.holes]);
  

  useEffect(() => {
    console.log('[PROJECT] scope load')
    Promise.all([
      getOpenProject(),
      // getPalette(),
      refreshLidarSources(),
      // getMeshLayers()
    ]).then(() => {
      setIsPending(false);
    });
    window.meshery.on('project.opened', handleProjectChanged);
    return () => {
      window.meshery.off('project.opened', handleProjectChanged);
    }    
  }, []);


  if (isPending) {
    return null;
  }

  return (
    <ProjectContext.Provider value={{
      // settings,
      // lidarFile,
      // setSettings,
      // setProject,
      createProject,
      setProjectSettings,
      updateSceneSettings,
      selectHDRI,
      addHole,
      removeHole,
      editHole,
      addTreeLayer,
      removeTreeLayer,
      updateTreeLayer,
      importTreeModel,
      removeTreeModel,
      project,
      lidarSources,
      handleDownloadCourse,
      generateHillShade,
      generateSatellite,
      generateTerrainData,
      palette,
      updateLayerById,
      generateMeshes,
    }}>
      {children}
    </ProjectContext.Provider>
  );
};