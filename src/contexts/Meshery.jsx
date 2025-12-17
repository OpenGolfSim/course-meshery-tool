import React, { useState, useRef, useEffect, createContext, useContext, useCallback } from 'react';

const workerPath = new URL('../workers/mesh.js', import.meta.url);
console.log('workerPath: ', workerPath);

// Create the context with a default value (e.g., 'light')
const MesheryContext = createContext({
  workerPath,
  worker: null,
  settings: {},
  setSettings: () => {}
});

// Create a custom hook to easily consume the context
export const useMeshery = () => useContext(MesheryContext);


export const MesheryProvider = ({ children }) => {
  const meshJobMap = useRef({});
  const [settings, setSettings] = useState({
    heightScale: 10,
    terrainSize: 4097,
    wireframe: true,
    vertexColors: true,
    selectedLayer: null
  });
  
  // const worker = new Worker(workerPath);
  const workerRef = useRef(new Worker(workerPath));
  // console.log('made a worker: ', workerRef);
  
  const generateMesh = useCallback((payload) => {
    if (meshJobMap[payload.layer.id]) {
      meshJobMap[payload.layer.id].reject('Canceled');
    }
    meshJobMap[payload.layer.id] = Promise.withResolvers();
    workerRef.current.postMessage({ ...payload, settings });
    return meshJobMap[payload.layer.id].promise;
  }, [meshJobMap, settings]);

  const handleWorkerMessage = useCallback((event) => {
    if (meshJobMap[event.data.layer.id]) {
      console.log(`Found job in map`, event.data);
      // jobMap[event.data.layer.id].
      meshJobMap[event.data.layer.id].resolve(event.data);
    } else {
      console.log(`Worker response`, event.data);
    }
  }, [meshJobMap]);

  useEffect(() => {
    workerRef.current.addEventListener('message', handleWorkerMessage);
    return () => {
      workerRef.current.removeEventListener('message', handleWorkerMessage);
    }
  }, []);

  // The value prop holds the data (state and function) you want to share
  return (
    <MesheryContext.Provider value={{ generateMesh, settings, setSettings }}>
      {children}
    </MesheryContext.Provider>
  );
};