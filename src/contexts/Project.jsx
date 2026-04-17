import React, { useState, useRef, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import logger from 'electron-log/renderer';

const log = logger.scope('RENDERER');
const CONCURRENT_JOBS = 6;

// Create the context with a default value (e.g., 'light')
const ProjectContext = createContext({
  // settings: { centerPoint: null, distance: 1 },
  project: null,
  setProject: () => {},
  generateHillShade: () => {},
  generateSatellite: () => {},
  setProjectSettings: () => {},
  searchOSMShapes: () => {},
  handleDownloadCourse: () => {},
  createProject: () => {},
  lidarSources: null,
  lidarFile: null,
});

// Create a custom hook to easily consume the context
export const useProject = () => useContext(ProjectContext);


export const ProjectProvider = ({ children }) => {
  const [isPending, setIsPending] = useState(true);
  // const [settings, setSettings] = useState({ centerPoint: null, distance: 1 });
  const [lidarSources, setLidarSources] = useState(null);
  // const [lidarFile, setLidarFile] = useState(null);
  const [project, setProject] = useState(null);
  const [meshLayers, setMeshLayers] = useState([]);
  const meshJobMap = useRef({});

  const setProjectSettings = (update) => {
    setProject((old) => ({ ...old, settings: { ...old.settings, ...update } }))
  }
  const getOpenProject = async () => {
    const data = await window.meshery.project.getOpenProject();
    console.log('project: ', data);
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

  const generateMesh = useCallback(async (layer) => {
    updateLayerById(layer.id, { pending: true, conformed: false });
    const result = await startWorkerJob(layer.id, { type: 'mesh', layer, settings: { project: project?.settings } });
    console.log('generated initial mesh', result);
    updateLayerById(layer.id, { mesh: result.mesh, pending: false, conformed: false });
    return result;
  }, [meshJobMap, project?.settings]);
  
  const refreshLidarSources = async () => {
    const data = await window.meshery.map.lidarSources();
    setLidarSources(data);
  }
  const handleProjectOpen = (_event, project) => {
    console.log('A project was opened or changed server side!', project);
    setProject(old => ({ ...old, ...project }));
    // setSettings(project.settings);
  }
  const handleDownloadCourse = async (feature, coords) => {
    const result = await window.meshery.lidar.downloadCourse(feature, coords);
    console.log('download result', result);
    if (result) {
      setProject(old => ({ ...old, ...result }));
    }
    // if (result) {
    //   setLidarFile(result);
    // }
  }

  const generateHillShade = async () => {
    const result = await window.meshery.imagery.hillShade();
    if (result) {
      setProject(old => ({ ...old, ...result }));
    }
    return result?.hillShade;
  }

  const generateSatellite = async (source) => {
    const result = await window.meshery.imagery.satellite(source);
    if (result) {
      setProject(old => ({ ...old, ...result }));
    }
    return result?.satellite;
  }
  
  const createProject = async () => {
    const result = await window.meshery.project.createProject();
    console.log('create result', result);
    if (result) {
      setProject(result);
    }
  }

  const searchOSMShapes = (coords) => {
    // window.meshery.map.searchShapes(coords).then(result => {
    //   const geoJsonData = osmtogeojson(result);
    //   console.log('geoJsonData', geoJsonData);
    //   setSettings(old => ({
    //     ...old,
    //     layers: geoJsonData.features
    //   }));
    //   // return geoJsonData;
    // });
  }
  // const updateSettings = useCallback((update) => {
  //   setSettings(old => ({ ...old, ...update }));
  // }, []);

  // const handleSaveRequest = useCallback(() => {
  //   console.log('send settings to main', settings);
  //   window.meshery.project.saveWrite(settings);
  // }, [settings]);

  const handleMeshLayerChange = (_evt, layers) => {
    console.log('mesh layer');
    setMeshLayers(layers);
  }

  useEffect(() => {
    if (project?.settings && !isPending) {
      console.log('sync settings back to main', project.settings);
      window.meshery.project.storeSettings(project.settings);
    }
  }, [project?.settings]);

  useEffect(() => {
    console.log('scope load')
    Promise.all([
      getOpenProject(),
      refreshLidarSources(),
      // getMeshLayers()
    ]).then(() => {
      setIsPending(false);
    });
    window.meshery.on('project.opened', handleProjectOpen);
    window.meshery.on('project.meshLayers', handleMeshLayerChange);
    return () => {
      window.meshery.off('project.opened', handleProjectOpen);
      window.meshery.off('project.meshLayers', handleMeshLayerChange);
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
      setProject,
      createProject,
      setProjectSettings,
      project,
      lidarSources,
      searchOSMShapes,
      handleDownloadCourse,
      generateHillShade,
      generateSatellite
    }}>
      {children}
    </ProjectContext.Provider>
  );
};