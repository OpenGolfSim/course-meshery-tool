import React, { useState, useRef, useEffect, createContext, useContext, useCallback } from 'react';
import MeshWorker from '../workers/mesh.worker.js';
import logger from 'electron-log/renderer';

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
  const [meshJobMap, setMeshJobMap] = useState({});
  const [layers, setLayers] = useState([]);
  const [systemError, setSystemError] = useState(null);
  const [settings, setSettings] = useState({
    heightScale: 10,
    svgSize: [0, 0],
    terrainSize: 4097,
    wireframe: true,
    vertexColors: false,
    selectedLayer: null
  });
  
  // const worker = new Worker(workerPath);
  // const workerPath = new URL('../workers/mesh.worker.js', import.meta.url);
  // console.log('workerPath: ', workerPath);
  // const workerRef = useRef();
  
  const cancelWorker = () => {
  }
  const generateMesh = useCallback((payload) => {
    const layerId = payload.layer.id;
    
    if (meshJobMap?.[layerId]?.promise) {
      console.log(`cancel job: ${layerId}`);
      meshJobMap[layerId].worker?.terminate();
      meshJobMap[layerId].reject('canceled');
      meshJobMap[layerId] = null;
    }

    const { promise, resolve, reject } = Promise.withResolvers();
    
    // const worker = new Worker(
    //   new URL('../workers/mesh.worker.js', import.meta.url),
    //   { workerData: { ...payload, settings } }
    // );
    const worker = new MeshWorker();
    worker.addEventListener('message', handleWorkerMessage);
    
    meshJobMap[layerId] = {
      worker,
      promise,
      resolve,
      reject
    };
    worker.postMessage({ ...payload, settings });
    return meshJobMap[layerId].promise;

  }, [meshJobMap, settings]);

  const handleWorkerMessage = useCallback((event) => {
    const layerId = event.data?.layer?.id;
    console.log(`Job finished: ${layerId}`);
    if (meshJobMap[layerId]) {
      meshJobMap[layerId].resolve(event.data);
      meshJobMap[layerId] = null;
    } else {
      log.error(`Response from unmapped job! (${layerId})`);
    }
  }, [meshJobMap]);

  const handleError = (event, errorMessage) => {
    setSystemError(errorMessage);
  };

  const clearSystemError = () => {
    setSystemError(null);
  };

  const updateLayerById = (layerId, update) => {
    setLayers(existing => existing.map(l => (l.id === layerId ? { ...l, ...update } : l)));
    // setLayers(old => {
    //   const matched = old.find(l => l.id === layerId);
    //   matched = { ...matched, ...update };
    //   return [...old];
    // });    
  }
  
  useEffect(() => {
    // workerRef.current = new MeshWorker();
    // log.info('Created a worker: ', workerRef);
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
      systemError,
      clearSystemError,
      settings,
      setSettings,
      layers,
      setLayers,
      updateLayerById
    }}>
      {children}
    </MesheryContext.Provider>
  );
};