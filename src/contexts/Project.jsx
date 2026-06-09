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
  setProjectSettings: () => {},
  updateSceneSettings: () => {},
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
  // const [settings, setSettings] = useState({ centerPoint: null, distance: 1 });
  const [lidarSources, setLidarSources] = useState(null);
  // const [lidarFile, setLidarFile] = useState(null);
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
    // setProject((old) => ({ ...old, settings: { ...old.settings, ...update } }))
  }
  const updateSceneSettings = async (update) => {
    const updated = await window.meshery.project.updateScene(update);
    setProject((old) => ({ ...old, scene: { ...old.scene, ...updated.scene } }))
    // setProject((old) => ({ ...old, settings: { ...old.settings, ...update } }))
  }
  
  const getPalette = async () => {
    const res = await window.meshery.colors.palette();
    console.log('getPalette: ', res);
    setPalette(res);
  }
  const getOpenProject = async () => {
    const data = await window.meshery.project.getOpenProject();
    console.log('getOpenProject: ', data);
    data.holes = new Map(data.holes);
    setProject(data);
    // if (data.settings) {
    //   setSettings(data.settings);
    // }
    // if (data.lidar) {
    //   setLidarFile(data.lidar);
    // }
  }
  // const getMeshLayers = async () => {
  //   const res = await window.meshery.svg.getMeshLayers();
  //   console.log('getMeshLayers: ', res);
  //   setMeshLayers(res);
  // }

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
      // data: { ...payload, jobId },
      promise,
      resolve,
      reject
    };
    
    worker.addEventListener('message', handleWorkerMessage);
    worker.addEventListener('error', handleWorkerError);
    worker.postMessage({ ...payload, jobId });

    return promise;
  }

  // const generateMesh = useCallback(async (layer) => {
  //   updateLayerById(layer.id, { pending: true, conformed: false });
  //   const result = await startWorkerJob(layer.id, { type: 'mesh', layer, settings: { project: project?.settings } });
  //   console.log('generated initial mesh', result);
  //   updateLayerById(layer.id, { mesh: result.mesh, pending: false, conformed: false });
  //   return result;
  // }, [meshJobMap, project?.settings]);
  
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
    // if (clear) {
    // } else {
    //   setProject(old => ({ ...old, ...updatedProject }));
    // }
    console.log('[PROJECT] set', updatedProject);
    // setSettings(project.settings);
  }

  const handleDownloadCourse = async (feature, coords) => {
    if (feature.type === 'dem') {
      await window.meshery.imagery.downloadDEM(coords);
      // const result = await window.meshery.lidar.downloadCourse(feature, coords);
      return;
    }
    const result = await window.meshery.lidar.downloadCourse(feature, coords);
    console.log('[PROJECT] handleDownloadCourse', result);
    // // TODO: we can probably remove this and fire change event from server?
    // console.log('download result', result);
    // if (result) {
    //   setProject(old => ({ ...old, ...result }));
    // }
  }

  const generateHillShade = async () => {
    const result = await window.meshery.imagery.hillShade();
    console.log('[PROJECT] generateHillShade', result);
    // if (result) {
    //   setProject(old => ({ ...old, ...result }));
    // }
    return result?.hillShade;
  }

  const generateSatellite = async (source) => {
    const result = await window.meshery.imagery.satellite(source);
    console.log('[PROJECT] generateSatellite', result);
    // if (result) {
    //   setProject(old => ({ ...old, ...result }));
    // }
    return result?.satellite;
  }
  
  const createProject = async () => {
    const result = await window.meshery.project.createProject();
    console.log('[PROJECT] createProject', result);
    // project.holes = new Map(project.holes);
    // if (result) {
    //   setProject(result);
    // }
  }
  
  const importTreeModel = async (treeLayerId) => {
    const updatedTrees = await window.meshery.trees.import(treeLayerId);
    if (updatedTrees) {
      setProject((old) => ({ ...old, trees: updatedTrees }))
    }
  }
  
  const removeTreeModel = async (treeLayerId, treeConfigId) => {
    // const res = await window.meshery.trees.addLayer();
    const res = await window.meshery.trees.remove(treeLayerId, treeConfigId);
    console.log('remove-res', res);
    if (res?.trees) {
      setProject((old) => ({ ...old, trees: res.trees }))
    }
  }
  const addTreeLayer = async () => {
    const res = await window.meshery.trees.addLayer();
    if (res) {
      // setProject(res);
      setProject((old) => ({ ...old, trees: res.trees }))
    }
    // setProject(old => ({ ...old, trees: [...(old.trees || []), tree] }));

  //   // setProject(old => ({ }))
  //   const updated = await window.meshery.project.updateTrees(trees);
  //   if (updated) {
  //     setProject(old => ({ ...old, trees: updated }));
  //   }
  };
  
  const removeTreeLayer = async (layerId) => {
    console.log('[PROJECT] treeToRemove', layerId);
    const confirmed = await window.meshery.dialog.confirm({ message: 'Are you sure you want to remove this layer?' });
    if (confirmed) {
      const res = await window.meshery.trees.removeLayer(layerId);
      if (res) {
        setProject((old) => ({ ...old, trees: res.trees }))
        // setProject(res);
      }
    }
  };
  
  const updateTreeLayer = async (layerId, layerUpdate) => {
    console.log('layerId, layerUpdate', layerId, layerUpdate);
    const res = await window.meshery.trees.updateLayer(layerId, layerUpdate);
    if (res) {
      setProject((old) => ({ ...old, trees: res.trees }))
      // setProject(res);
    }
  };

  

  // const updateSettings = useCallback((update) => {
  //   setSettings(old => ({ ...old, ...update }));
  // }, []);

  // const handleSaveRequest = useCallback(() => {
  //   console.log('send settings to main', settings);
  //   window.meshery.project.saveWrite(settings);
  // }, [settings]);


  const updateLayerById = (layerId, update) => {
    return window.meshery.project.updateLayerById(layerId, update);
    // console.log('[PROJECT] updateLayerById', result);
    // setProject(old => ({ ...old, ...result }));    
  }

  const editHole = (holeNumber, update) => {
    if (!holeNumber) { // should be >= 1
      console.error('Missing hole number');
      return;
    }
    console.log('[PROJECT] editHole', holeNumber, update);
    return window.meshery.project.updateHoleByNumber(holeNumber, update);
    // const holeIndex = holeNumber - 1;
    // setProject((old) => {
    //   const copy = new Map([...old.entries()];
    //   // const holesCopy = [...copy.settings.holes];
    //   // if (holesCopy?.[holeIndex]) {
    //   //   holesCopy[holeIndex] = { ...holesCopy[holeIndex], ...update };
    //   //   copy.settings = { ...copy.settings, holes: holesCopy };
    //   // }
    //   return copy;
    // });
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

    // setProject((old) => ({ ...old, settings: { ...old.settings, ...update } }))
    // setProject((old) => ({
    //   ...old,
    //   settings: {
    //     ...old.settings,
    //     holes: [
    //       ...old?.settings?.holes || [], 
    //       {
    //         number: (old.settings?.holes?.length || 0) + 1,
    //         par: 3,
    //         tee: null,
    //         hole: null,
    //         aim: null
    //       }
    //     ]
    //   }
    // }));
  }, [project?.holes]);
  
  // // sync tree settings
  // useEffect(() => {
  //   if (isPending) { return; }
  //   if (!treesInitialized.current) {
  //     treesInitialized.current = true;
  //     return;
  //   }
  //   console.log(`trees change: isPending:${isPending},treesInitialized:${treesInitialized.current},isArray:${Array.isArray(project?.trees)}`);

  //   if (Array.isArray(project?.trees)) {
  //     console.log('Saving trees');
  //     window.meshery.project.updateTrees(project.trees).then(() => {
  //       console.log('Tree map saved');
  //     });
  //   }
  //   return () => {
  //     treesInitialized.current = false;
  //   }
  // }, [project?.trees, isPending]);  

  // sync project settings
  // useEffect(() => {

  //   if (isPending) { return; }
  //   if (!settingsInitialized.current) {
  //     settingsInitialized.current = true;
  //     return;
  //   }
  //   if (!project?.settings) {
  //     return;
  //   }
  //   // console.log('sync settings', project?.settings, isPending, initProject.current);
  //   // if (!initProject.current) {
  //   //   // skip first run
  //   //   initProject.current = true;
  //   //   return;
  //   // }
  //   console.log('sync settings back to main!', project.settings);
  //   window.meshery.project.storeSettings(project.settings);
  //   // if (project?.settings && !isPending) {
  //   //   console.log('sync settings back to main', project.settings);
  //   //   window.meshery.project.storeSettings(project.settings);
  //   // }
  // }, [project?.settings, isPending]);

  useEffect(() => {
    console.log('[PROJECT] scope load')
    Promise.all([
      getOpenProject(),
      getPalette(),
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
      palette,
      updateLayerById
    }}>
      {children}
    </ProjectContext.Provider>
  );
};