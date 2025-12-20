import React, { useState, useRef, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import MeshWorker from '../workers/mesh.worker.js';
import logger from 'electron-log/renderer';
import * as StackBlur from 'stackblur-canvas';
import pMap from 'p-map';

const log = logger.scope('RENDERER');

// Create the context with a default value (e.g., 'light')
const MesheryContext = createContext({
  worker: null,
  systemError: null,
  settings: {},
  layers: [],
  clearSystemError: () => {},
  setSettings: () => {},
  updateLayerById: () => {},
  setLayers: () => {}
});

// Create a custom hook to easily consume the context
export const useMeshery = () => useContext(MesheryContext);


export const MesheryProvider = ({ children }) => {
  const meshJobMap = useRef({});
  const [layers, setLayers] = useState([]);
  const [systemError, setSystemError] = useState(null);
  const [isPending, setIsPending] = useState(false);
  const [inputHeightMap, setInputHeightMap] = useState(null);
  const [finalHeightMap, setFinalHeightMap] = useState(null);
  const [settings, setSettings] = useState({
    svgFilePath: undefined,
    rawFilePath: undefined,
    heightScale: 10,
    svgSize: [0, 0],
    terrainSize: 4097,
    terrainSmoothingStrength: 0,
    terrainSmoothingRadius: 0,
    wireframe: true,
    vertexColors: false,
    selectedLayer: null
  });
  
  const exportedSettings = useMemo(() => {
    return { ...settings };
  }, [settings]);
  
  // const worker = new Worker(workerPath);
  // const workerPath = new URL('../workers/mesh.worker.js', import.meta.url);
  // console.log('workerPath: ', workerPath);
  // const workerRef = useRef();
  
  const startWorkerJob = (jobId, payload) => {
    if (meshJobMap?.[jobId]?.promise) {
      console.log(`cancel existing job: ${jobId}`);
      meshJobMap[jobId].worker?.terminate();
      meshJobMap[jobId].reject('canceled');
      meshJobMap[jobId] = undefined;
    }

    const { promise, resolve, reject } = Promise.withResolvers();
    const worker = new MeshWorker();
    worker.addEventListener('message', handleWorkerMessage);

    meshJobMap[jobId] = {
      worker,
      promise,
      resolve,
      reject
    };
    worker.postMessage({ ...payload, jobId });
    return promise;
  }

  const smoothTerrain = useCallback(() => {
    return startWorkerJob('terrain', { type: 'terrain', settings, heightMap: inputHeightMap });
  }, [meshJobMap, settings, inputHeightMap]);

  const conformMesh = useCallback(async (layer) => {
    const result = await startWorkerJob(layer.id, { type: 'conform', layer, settings, heightMap: finalHeightMap });
    updateLayerById(layer.id, { mesh: result.mesh, conformed: true });
  }, [meshJobMap, settings, finalHeightMap]);

  const generateMesh = useCallback(async (layer) => {
    updateLayerById(layer.id, { pending: true, conformed: false });
    const result = await startWorkerJob(layer.id, { type: 'mesh', layer, settings });
    updateLayerById(layer.id, { mesh: result.mesh, pending: false, conformed: false });
    return result;
  }, [meshJobMap, settings]);

  const handleWorkerMessage = useCallback((event) => {
    const jobId = event.data?.jobId;
    if (!jobId) {
      log.error('Job data invalid', event);
    }
    log.error('Job Finished', event);
    if (meshJobMap[jobId]) {
      meshJobMap[jobId].resolve(event.data);
      meshJobMap[jobId].worker.terminate();
      meshJobMap[jobId] = null;
    } else {
      log.error(`Response from unmapped job! (${jobId})`);
    }
  }, [meshJobMap]);

  const handleError = (event, errorMessage) => {
    setSystemError(errorMessage);
  };

  const clearSystemError = () => {
    setSystemError(null);
  };
  const regenerateAllMeshes = () => {
    setLayers(existing => existing.map(l => ({ ...l, mesh: false })));
  }
  const updateLayerById = (layerId, update) => {
    setLayers(existing => existing.map(l => (l.id === layerId ? { ...l, ...update } : l)));
    // setLayers(old => {
    //   const matched = old.find(l => l.id === layerId);
    //   matched = { ...matched, ...update };
    //   return [...old];
    // });    
  }


  // const generateTerrain = useCallback((payload) => {
  //   setFinalHeightMap(old => ({ pending: true, data: smoothed }));
  //   const smoothed = StackBlur.imageDataRGB(settings.heightMap, top_x, top_y, width, height, radius);
  //   setFinalHeightMap(old => ({ pending: false, data: smoothed }));
  //   // const worker = new MeshWorker();
  //   // const handleTerrainComplete = (result) => {
  //   //   console.log('terrain finished', result);
  //   //   worker.removeEventListener('message', handleTerrainComplete);
  //   //   worker = null;
  //   // }
  //   // worker.addEventListener('message', handleTerrainComplete);
  //   // worker.postMessage({ type: 'mesh', ...payload, settings });
  // }, [settings]);
  const generateTerrainData = useCallback(async () => {
    console.log('regenerate terrain data...', settings);
    // setFinalHeightMap({ pending: true });
    const result = await smoothTerrain();
    setFinalHeightMap(result.heightMap);
    // setIsPending(true);
    // const { terrainSize, terrainSmoothingStrength, terrainSmoothingRadius } = settings;
    // const result = await window.meshery.generateTerrain({
    //   terrainSize,
    //   terrainSmoothingStrength,
    //   terrainSmoothingRadius
    // });
    // console.log('received terrain data', result.length);
    // setIsPending(false);
  }, [settings]);
  
  // const debounceTimer = useRef();
  useEffect(() => {
    if (!settings.rawFilePath) {
      return;
    }
    console.log('debounce');
  //   clearTimeout(debounceTimer.current);
  //   debounceTimer.current = setTimeout(generateTerrainData, 600);
    generateTerrainData();
  }, [settings.rawFilePath, settings.terrainSmoothingRadius]);
  
  useEffect(() => {
    if (!layers?.length) {
      return; 
    }
    
    console.log('Terrain data change detected, conforming meshes again');
    setLayers(layers => layers.map(l => ({ ...l, conformed: false })));
    pMap(layers, conformMesh, { concurrency: 10 }).then(() => {
      log.info('all done');
    });
    // layers.map(async (layer) => {
    //   updateLayerById(layer.id, { conformed: false });
    //   const result = await conformMesh(layer);
    //   updateLayerById(layer.id, { mesh: result.mesh, conformed: true });
    // })).then(() => {
    //   console.log('all done');
    // });
  }, [finalHeightMap, settings.heightScale]);

  // const updateSettings = useCallback((update) => {
  //   setSettings(({ ...settings, ...update }));
  // }, [settings]);
  // useEffect(() => {
  //   if (!layers.length) {
  //     return;
  //   }
  // //   log.info('Regenerate all meshes!');
  // //   clearTimeout(debounceTimerMesh.current);
  // //   debounceTimerMesh.current = setTimeout(regenerateAllMeshes, 1000);
  //   console.log('regenerateAllMeshes');
  //   regenerateAllMeshes();
  // }, [settings.heightScale]);
  
  useEffect(() => {
    // workerRef.current = new MeshWorker();
    log.info('Hello from the renderer!');
    // workerRef.current.addEventListener('message', handleWorkerMessage);
    window.meshery.on('error', handleError);

    return () => {
      // workerRef.current.removeEventListener('message', handleWorkerMessage);
      window.meshery.off('error', handleError);
    }
  }, []);

  // The value prop holds the data (state and function) you want to share
  return (
    <MesheryContext.Provider value={{
      generateMesh,
      inputHeightMap,
      finalHeightMap,
      conformMesh,
      setInputHeightMap,
      systemError,
      setSystemError,
      clearSystemError,
      settings: exportedSettings,
      setSettings,
      layers,
      setLayers,
      updateLayerById
    }}>
      {children}
    </MesheryContext.Provider>
  );
};