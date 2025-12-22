import React, { useState, useRef, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import logger from 'electron-log/renderer';
import * as StackBlur from 'stackblur-canvas';
import MeshWorker from '../workers/mesh.worker.js';
import pMap from 'p-map';

const log = logger.scope('RENDERER');
const CONCURRENT_JOBS = 6;

// Create the context with a default value (e.g., 'light')
const MesheryContext = createContext({
  worker: null,
  systemError: null,
  settings: {},
  layers: [],
  clearSVG: () => {},
  clearSystemError: () => {},
  setSettings: () => {},
  updateLayerById: () => {},
  setLayers: () => {}
});

// Create a custom hook to easily consume the context
export const useMeshery = () => useContext(MesheryContext);


export const MesheryProvider = ({ children }) => {
  const meshJobMap = useRef({});
  const firstLoad = useRef(false);
  const [layers, setLayers] = useState([]);
  const [systemError, setSystemError] = useState(null);
  const [systemLoading, setSystemLoading] = useState('');
  
  const [isPending, setIsPending] = useState(false);
  const [inputHeightMap, setInputHeightMap] = useState(null);
  const [finalHeightMap, setFinalHeightMap] = useState(null);
  const [svgData, setSvgData] = useState(null);
  const [jobQueue, setJobQueue] = useState([]);
  const [isJobQueueRunning, setIsJobQueueRunning] = useState(false);
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

  const runWorkerWob = (job, index) => {
    job.worker.addEventListener('message', handleWorkerMessage);
    job.worker.postMessage(job.data);
    setJobQueue(old => {
      const copy = old;
      copy.splice(index, 1);
      return copy;
    });
  }
  
  // useEffect(() => {
  //   if (!jobQueue.length || isJobQueueRunning) {
  //     return; 
  //   }
  //   console.log('start queue', jobQueue.length);
  //   setIsJobQueueRunning(true);
  //   pMap(jobQueue, runWorkerWob, { concurrency: 1 }).then(() => {
  //     log.info('all done');
  //     setIsJobQueueRunning(false);
  //   });
  //   // const activeJob = jobQueue.splice(0, 1);
  //   // worker.postMessage({ ...payload, jobId });
  // }, [jobQueue]);

  const smoothTerrain = useCallback(() => {
    return startWorkerJob('terrain', { type: 'terrain', settings, heightMap: inputHeightMap });
  }, [meshJobMap, settings, inputHeightMap]);

  const conformMesh = useCallback(async (layer) => {
    const result = await startWorkerJob(layer.id, { type: 'conform', layer, settings, heightMap: finalHeightMap });
    updateLayerById(layer.id, { mesh: result.mesh, pending: false, conformed: true });
  }, [meshJobMap, settings, finalHeightMap]);

  const generateMesh = useCallback(async (layer) => {
    updateLayerById(layer.id, { pending: true, conformed: false });
    const result = await startWorkerJob(layer.id, { type: 'mesh', layer, settings });
    updateLayerById(layer.id, { mesh: result.mesh, pending: false, conformed: false });
    return result;
  }, [meshJobMap, settings]);

  const handleWorkerError = useCallback((event) => {
    log.error('WORKER ERROR');
  }, []);

  const handleWorkerMessage = useCallback((event) => {
    if (event.data.error) {
      log.error('worker.error', event.data.error);
      setSystemError(event.data.error || 'An unknown error has occurred');
      log.error(event);
      return;
    }
    const jobId = event.data?.jobId;
    if (!jobId) {
      log.error('Job data invalid', event);
    }
    // log.error('Job Finished', event);
    if (meshJobMap[jobId]) {
      meshJobMap[jobId].worker.terminate();
      meshJobMap[jobId].resolve(event.data);
      meshJobMap[jobId] = null;
    } else {
      log.error(`Response from unmapped job! (${jobId})`);
    }
  }, [meshJobMap]);

  const generateFirstMeshes = useCallback(() => {
    log.info('Initial meshing...');
    pMap(layers, async (layer) => {
      const result = await generateMesh(layer);
      await conformMesh({ ...layer, mesh: result.mesh });
    }, { concurrency: CONCURRENT_JOBS }).then(() => {
      log.info('All done');
    });
  }, [settings, layers]);


  useEffect(() => {
    if (layers?.length && settings.svgSize?.[0] > 0 && !firstLoad.current) {
      firstLoad.current = true;
      setSystemLoading('');
      generateFirstMeshes();
    }
  }, [layers, settings.svgSize]);

  useEffect(() => {
    if (!svgData) {
      return;
    }
    // log.debug('handleSVGImported!');
    startWorkerJob('svg', { type: 'svg', settings, svgData }).then(result => {
      if (result?.width && result?.height) {
        setSettings(old => ({
          ...old,
          svgSize: [result.width, result.height]
        }));
      }
      if (result.layers) {
        setLayers(result.layers);
      }
    }).catch(error => {
      setSystemError(error.message);
    });

    // setSettings(settings => ({
    //   ...settings,
    //   palette: result?.palette,
    //   svgFilePath: result?.svg,
    //   svgSize: [result?.width, result?.height]
    // }));
    
    // if (result?.layers) {
    //   log.debug('result?.layers', result.layers);
    //   setLayers(result.layers);
    //   if (result.layers.some(layer => layer.error)) {
    //     return;
    //   }
    //   pMap(result.layers, async (layer) => {
    //     log.debug('generating initial mesh', layer.id);
    //     const result = await generateMesh(layer);
    //     await conformMesh({ ...layer, mesh: result.mesh });
    //     log.debug('conforming initial mesh', layer.id, finalHeightMap);
    //   }, { concurrency: 10 }).then(() => {
    //   // pMap(layers, runWorkerWob, { concurrency: 1 }).then(() => {
    //     log.info('all done');
    //     // setIsJobQueueRunning(false);
    //   });
    // }

    
  }, [svgData]);

  const handleError = (event, errorMessage) => {
    setSystemError(errorMessage);
  };

  const clearSVG = () => {
    setSvgData('');
    setSettings(settings => ({
      ...settings,
      palette: undefined,
      svgFilePath: undefined,
      svgSize: [0, 0]
    }));
    setLayers([]);
    firstLoad.current = false;
    
  };
  const clearSystemError = () => {
    setSystemError(null);
  };
  const clearSystemLoading = () => {
    setSystemLoading('');
  }
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
    setSystemLoading('Smoothing terrain...');
    const result = await smoothTerrain();
    console.log('SET FINAL HEIGHTMAP');
    setFinalHeightMap(result.heightMap);
    setSystemLoading('');
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
    console.log('regenerate terrain data');
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
    pMap(layers, conformMesh, { concurrency: CONCURRENT_JOBS }).then(() => {
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
    window.meshery.on('error', handleError);
    // window.meshery.on('svg.imported', handleSVGImported);
    return () => {
      window.meshery.off('error', handleError);
      // window.meshery.off('svg.imported', handleSVGImported);
    }
  }, []);

  // The value prop holds the data (state and function) you want to share
  return (
    <MesheryContext.Provider value={{
      generateMesh,
      inputHeightMap,
      finalHeightMap,
      conformMesh,
      setSvgData,
      setInputHeightMap,
      systemError,
      setSystemError,
      clearSystemError,
      settings: exportedSettings,
      setSettings,
      layers,
      setLayers,
      updateLayerById,
      clearSVG,
      clearSystemLoading,
      systemLoading,
      setSystemLoading
    }}>
      {children}
    </MesheryContext.Provider>
  );
};