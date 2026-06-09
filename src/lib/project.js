import path from 'path';
import fs from 'fs';
import * as _ from 'lodash';
import { dialog, ipcMain, shell } from 'electron';
import logger from 'electron-log';
import { broadcast, mainWindow } from './window';
import { ensureRecent } from './app';
import { generateSVG, geoJSONToSvgPaths, parseSVG, storedPathsToSVG } from './svg';
import { parseRaw } from './heightmap';
import { conformMesh, layerToMesh, smoothTerrain, svgToCourseLayers } from './workers';
import { IMAGERY_DIR, PROJECT_FILE_PROTOCOL, TERRAIN_DIR, TREE_IMPORT_PREFIX } from '../constants';
import { getDateId } from './utils';
import { randomUUID } from 'crypto';
import { buildShapeCache, parseShapeCache } from './cache/shapes';
import { buildMeshCache, parseMeshCache } from './cache/meshes';

const log = logger.scope('PROJECT');

const defaultProjectSettings = {
  centerPoint: null,
  distance: 1,
  terrainSmooth: 4,
};

const defaultProjectTemplate = {
  _filePath: null,
  _workingDir: null,
  _dirty: true,
  _svgBuffer: null,
  _heightMap: null,
  name: 'Untitled',
  lidar: null,
  dem: null,
  svg: null,
  raw: null,
  satellite: {},
  hillShade: null,
  coursePaths: null,
  settings: defaultProjectSettings,
  holes: new Map(),
  scene: {
    sky: {
      type: 'clouds',
      radius: 800,
      box: { filePath: null, url: null },
      clouds: {
        density: 0.4,
        opacity: 0.8,
        fogColor: '#f8f8f1',
        skyColor: '#e0eef4',
        cloudColor: '#ffffff',
        scale: 5.0,
        position: [0, 0, 0]
      }
    }, 
  },
  trees: []
};

export let openProject = { ...defaultProjectTemplate };

export const meshData = {
  // layers: [],
  meshes: new Map(),
  shapes: new Map(),
  state: { running: false }
}

function setDirty() {
  openProject._dirty = true;
  mainWindow.setTitle(`${openProject.name} (unsaved) - Meshery`);
}

function setClean() {
  openProject._dirty = false;
  mainWindow.setTitle(`${openProject.name} - Meshery`);
}

export async function storeSettings(update) {
  console.log('---- storeSettings -----');
  console.log('   update ', update);
  console.log('   openProject.settings ', openProject.settings);
  const updatedSettings = _.merge({ ...openProject.settings }, update);
  const changed = !_.isEqual(updatedSettings, openProject.settings);
  if (changed) {
    console.log('Project settings changed!');
    openProject.settings = updatedSettings;
    await saveProjectSettings();
  } else {
    console.log('Project settings NOT changed!');
    console.log('     vs', updatedSettings);
  }
  console.log('-------------- - - - -');
  return openProject;
}

export function getSettings() {
  return openProject.settings;
}

async function parseRawData() {
  try {
    if (!openProject.raw?.filePath) {
      return;
      // throw new Error(`No raw file generated yet`);
    }
    if (!fs.existsSync(openProject.raw?.filePath)) {
      throw new Error(`Raw file does not exist (${filePath})`);
    }    
    log.info(`Parsing RAW file (${openProject.raw.filePath})`);
    const data = await parseRaw(openProject.raw.filePath);
    if (!data?.length) {
      throw new Error('The raw height map file appears to be empty')
    }
    const size = Math.sqrt(data.length);
    log.info(`Height map returned ${data.length} points (size: ${size})`);
    return {
      data,
      size
    };
  } catch (error) {
    log.error('RAW error', error);
    return null;
  }
}


export async function saveHeightMap(heightMapData) {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Save RAW',
    defaultPath: path.join(
      openProject._workingDir,
      TERRAIN_DIR,
      `terrain_edit_${getDateId()}.raw`
    ),
    buttonLabel: 'Save',
  });
  if (!filePath || canceled) {
    log.warn('No SVG file was selected');
    return;
  }
  
  console.log('Writing filePath', filePath);
  await fs.promises.writeFile(filePath, Buffer.from(heightMapData.buffer));

  const raw = {
    filePath,
    uri: `${PROJECT_FILE_PROTOCOL}:///${path.join(TERRAIN_DIR, path.basename(filePath))}`
  };

  openProject.raw = raw;
  // shell.showItemInFolder(filePath);
  
  await saveProjectSettings();

  openProject._heightMap = { data: heightMapData, size: heightMapData.byteLength };
}

export async function smoothRaw(data, radius) {
  console.log(`Smooth data: ${data.length}`);
  
  const waterShapes = openProject._meshes
    .filter(mesh => mesh.surface === 'water')
    .map(water => meshData.shapes.get(water.id));

  return smoothTerrain(data, radius, openProject, waterShapes);
}

export async function refreshRawData(emitEvent = false) {
  openProject._heightMap = await parseRawData();
  if (emitEvent) {
    broadcast('project.opened', openProject);
  }
}

export async function refreshSVG() {
  if (openProject.svg?.filePath) {
    await loadSVG(openProject.svg.filePath);
  }

  broadcast('project.opened', openProject);
}

export async function saveSVG() {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Save SVG',
    defaultPath: path.join(openProject._workingDir, 'course.svg'),
    // nameFieldLabel: 'Course Folder Name',
    // message: 'Create your project folder',
    buttonLabel: 'Save SVG',
  });
  if (!filePath || canceled) {
    log.warn('No SVG file was selected');
    return;
  }
  // create a simple SVG to start
  openProject.svg = { filePath, fileName: path.basename(filePath) };
  await saveProjectSettings();

  if (!filePath) {
    log.warn('No SVG file open in project');
    return;
  }

  log.info(`Generating SVG...`);
  openProject._svgBuffer = generateSVG();

  // openProject._layers = generateCoursePolygons(openProject._svgBuffer);
  
  if (!openProject._svgBuffer) {
    log.warn('No SVG buffer!');
    return;
  }
  await updateSVGData();
  await fs.promises.writeFile(filePath, openProject._svgBuffer);

  // svgToCourseLayers({ layers: openProject._layers, settings: openProject.settings });
}

async function updateSVGData() {
  log.info(`Parsing generated SVG to layers...`);
  const { layers } = await parseSVG(openProject._svgBuffer);
  openProject._layers = layers;
  broadcast('project.opened', openProject);
}

async function loadSVG(filePath) {
  if (!fs.existsSync(filePath)) {
    log.warn(`SVG does not exist (${filePath})`);
    openProject._svgBuffer = null; 
    openProject._layers = null;
    openProject.svg = null;
    return;
  }
  const data = await fs.promises.readFile(filePath);
  openProject._svgBuffer = data.toString('utf8');
  
  if (!openProject.svg) {
    openProject.svg = { filePath, fileName: path.basename(filePath) };
  }
  
  await updateSVGData();
}

export async function openRecent(project) {
  loadProjectFile(project._filePath);
}

export async function openExisting() {
  return open();
}

export async function createProject() {
  const folder = await createProjectFolder();
  if (!folder) {
    return;
  }
  openProject.name = path.parse(folder).name;
  openProject._filePath = path.join(folder, openProject.name + '.meshery');
  openProject._workingDir = folder;


  console.log(`Created new project folder: ${openProject._filePath}`);
  await saveProjectSettings();
  broadcast('project.opened', openProject);
  
  setClean();

  ensureRecent(openProject);

  return openProject;
  // const folder = await createProjectFolder();
  // if (!folder) {
  //   return;
  // }
}


export async function loadProjectFile(filePath) {
  const stored = JSON.parse(fs.readFileSync(filePath).toString());
  const filePathInfo = path.parse(filePath);

  let holes = new Map();
  console.log('loading project', stored);
  // parse holes to map
  if (stored.holes) {
    console.log('Converting from array of arrays (map)...', stored.holes);
    holes = new Map(stored.holes);
  }
  console.log('openProject.holes', holes);


  // then back as openProject.holes = Array.from(myMap.entries());
  openProject = _.merge({ ...defaultProjectTemplate }, {
    name: filePathInfo.name,
    _dirty: false,
    _filePath: filePath,
    _workingDir: filePathInfo.dir,
    ...stored,
    holes
  });
  // openProject = {
  //   name: filePathInfo.name,
  //   _dirty: false,
  //   _filePath: filePath,
  //   _workingDir: filePathInfo.dir,
  //   ...stored,
  //   holes
  // }


  ensureRecent(openProject);

  // migration for moving stats to root
  if (!openProject.stats && !!openProject.lidar?.stats) {
    openProject.stats = openProject.lidar.stats;
  }

  await refreshSVG();
  await refreshRawData();

  await parseShapeCache();
  await parseMeshCache();

  setClean();
  broadcast('project.opened', openProject);
}

export async function isOpen() {
  return !!openProject._filePath;
}

export async function close() {
  openProject = { ...defaultProjectTemplate };
  broadcast('project.opened', openProject, true);
}

export async function open() {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open Meshery Project',
    filters: [{ name: 'Meshery Project File', extensions: ['meshery'] }]
  });
  if (!canceled && filePaths.length) {
    console.log(`Opened: ${filePaths[0]}`);
    loadProjectFile(filePaths[0]);
  }
}

export async function saveProjectSettings() {
  if (!openProject._filePath) {
    return;
  }
  const outputProject = _.omitBy(openProject, (value, key) => key.startsWith('_'));
  outputProject.holes = Array.from(outputProject.holes ? outputProject.holes.entries() : new Map());
  await fs.promises.writeFile(openProject._filePath, JSON.stringify(outputProject, null, 1));
}

export async function save(_event) {
  if (!openProject?._filePath) {
    console.log('No project currently open!');
    const folder = await createProjectFolder();
    if (!folder) {
      return;
    }
    openProject.name = path.parse(folder).name;
    openProject._filePath = path.join(folder, 'project.meshery');
    openProject._workingDir = folder;


    console.log(`Created new project folder: ${openProject._filePath}`);
  }
  // const settings = await getProjectState();
  // openProject.settings = settings;
  console.log(`saving open project: ${openProject._filePath}`);
  console.log('      with settings: ', openProject.settings);


  // const outputProject = _.omit(openProject, ['settings', 'lidar']);
  const outputProject = _.omitBy(openProject, (value, key) => key.startsWith('_'));

  fs.writeFileSync(openProject._filePath, JSON.stringify(outputProject, null, 1));
  setClean();
}

export async function createProjectFolder(_event) {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Save Project',
    properties: ['createDirectory'],
    nameFieldLabel: 'Course Folder Name',
    message: 'Create your project folder',
    buttonLabel: 'Create Project Folder',
  });
  if (filePath && !canceled) {
    if (fs.existsSync(filePath)) {
      const error = 'This folder already exists. Please select a unique folder name for each project (e.g. My Course 2)';
      await dialog.showErrorBox('Output Folder', error);
      throw new Error(error);
    }
    fs.mkdirSync(filePath);
    return filePath;
  }
}

export function getOpenProject() {
  // fields starting with $ should stay server-side
  return _.omitBy(openProject, (value, key) => key.startsWith('$'));
}

export function getMeshLayers() {
  return openProject.$meshLayers;
}

async function generateCourseShapes(layerSettings, terrainSettings) {
  meshData.shapes.clear();
  const result = await svgToCourseLayers({
    layers: openProject._layers,
    settings: openProject.settings,
    layerSettings
  }, (update) => {
    // console.log(`${update.current}/${update.total} — ${update.status}`);
    broadcast('mesh.progress', {
      progress: update.progress,
      count: (update.current + 1),
      status: `Generating ${update.current+1} of ${update.total} polygons`
    });
  });
  if (!result.meshLayers?.length) {
    throw new Error('No course layers were generated');
  }
  if (!result.polygonMap) {
    throw new Error('No course layers were generated');
  }
  
  openProject._meshes = result.meshLayers;
  
  meshData.shapes = result.polygonMap;
  await buildShapeCache();
}

export async function generateMeshes(layerSettings, terrainSettings) {
  try {

    let progress = 1;
    let steps = 2;

    // meshData.layers = [];
    // meshData.shapes.clear();
    meshData.meshes.clear();
    meshData.state = { running: true };
    
    broadcast('mesh.progress', { progress, count: 0, status: 'Generating polygons from SVG' });

    await generateCourseShapes(layerSettings, terrainSettings)

    broadcast('project.opened', openProject);

    // meshData.courseLayers = courseLayers;
  
    // console.log(`Generated ${result.layers.length} layers, ${meshData.shapes.size} polygons`);

    broadcast('mesh.progress', { progress, count: 0, status: `Starting ${openProject._meshes.length} meshes` });

    // if (terrainSettings.smoothing && openProject._heightMap?.data) {
    //   log.info(`Smoothing terrain ${terrainSettings.smoothing}`);
    //   broadcast('mesh.progress', {
    //     progress,
    //     status: `Smoothing terrain with radius of ${terrainSettings.smoothing}`
    //   });  
    //   openProject._heightMap.smoothData = await smoothTerrain(openProject._heightMap.data, terrainSettings.smoothing);
    // } else {
    //   openProject._heightMap.smoothData = null;
    // }

    let index = 0;
    for (const layer of openProject._meshes) {
      const shape = meshData.shapes.get(layer.id);
      if (!shape) {
        throw new Error(`Unable to find polygon for ${layer.id} (${layer.name})`);
      }
      broadcast('mesh.progress', {
        progress,
        count: (index + 1),
        status: `Meshing ${layer.name} (${index+1} of ${openProject._meshes.length})`
      });
      const mesh = await layerToMesh(layer, shape, openProject);
      // layer.mesh = mesh;
      // meshMap.set(layer.id, mesh);
      // const conformedMesh = await conformMesh(layer, mesh, openProject);
      // console.log(`Meshing ${index} of ${result.layers.length} (triangles:${mesh.triangles.length}, points:${mesh.points.length})`);
      meshData.meshes.set(layer.id, { name: layer.name, mesh });
      // console.log(`Conformed (${layer.id}) ${index} of ${result.layers.length} (triangles:${mesh.triangles.length}, points:${mesh.points.length})`);
      
      progress = (index / openProject._meshes.length) * 100;
      index++;
    }
    meshData.state.error = undefined;
    meshData.state.generated = index;
    meshData.state.lastGenerated = Date.now();
    log.info(`Finished generating ${meshData.state.generated} meshes`);

    // const filePath = 
    await buildMeshCache();
    // broadcast('project.opened', openProject);

    // courseLayers.forEach((layer) => {
    //   const mesh = layerToMesh(layer);
    //   console.log('mesh', mesh);
    // });
  } catch (error) {
    log.error(error);
    meshData.state.error = error.message;
  } finally {
    meshData.state.running = false;
    console.log('send update', meshData.state);
    broadcast('mesh.data', meshData.state);
    return meshData.state;
  }
}

export function getMeshDataForLayer(layerId) {
  return meshData.meshes.get(layerId);
}
export function getMeshDataState() {
  return meshData.state;
}

export async function updateLayerById(layerId, update) {
  let layer = openProject._meshes.find(l => l.id === layerId);
  layer = _.merge(layer, update);
  
  console.log('update', layerId, update);

  if (update.spacing || update.dig) {
    // save settings to disk?
    await buildShapeCache();
    // layer._pending = true;

    const shape = meshData.shapes.get(layerId);    
    const mesh = await layerToMesh(layer, shape, openProject);
    meshData.meshes.set(layer.id, { name: layer.name, mesh });
    broadcast('mesh.data', meshData.state);
    // layer._pending = false;
    await buildMeshCache();
  }

  return openProject;
}

export async function updateTrees(treeUpdate) {
  openProject.trees = [ ...treeUpdate ];
  await saveProjectSettings();
}

export async function addTreeLayer() {
  openProject.trees = [
    ...(openProject.trees || []),
    {
      name: `Layer ${(openProject.trees.length || 0) + 1}`,
      id: `layer-${randomUUID()}`,
      randomSeed: 12345,
      positions: [],
      treeConfigs: []
    }
  ];
  await saveProjectSettings();
  return openProject;
}

export async function updateTreeLayer(layerId, layerUpdate) {
  const toUpdate = openProject.trees.findIndex(layer => layer.id === layerId);
  if (toUpdate > -1) {
    console.log(`updating index:${toUpdate}, id:${layerId}`, layerUpdate);
    openProject.trees[toUpdate] = _.merge({ ...openProject.trees[toUpdate] }, layerUpdate);
  }
  await saveProjectSettings();
  return openProject;
}

export async function removeTreeLayer(layerId) {
  const toRemove = openProject.trees.findIndex(layer => layer.id === layerId);
  if (toRemove > -1) {
    openProject.trees.splice(toRemove, 1);
  }
  await saveProjectSettings();
  return openProject;
}


export async function removeTreeConfig(treeLayerId, treeConfigId) {
  const foundLayer = openProject.trees.find(tl => tl.id === treeLayerId);
  if (foundLayer) {
    const foundConfig = foundLayer.treeConfigs.findIndex(cfg => cfg.id === treeConfigId);
    if (foundConfig > -1) {
      foundLayer.treeConfigs.splice(foundConfig, 1);
    }
    // foundLayer.treeConfigs = [
    //   ...(foundLayer.treeConfigs || []),
    //   config
    // ];
  }
  await saveProjectSettings();
  // broadcast('project.opened', openProject);   
  return openProject;
}

export async function postImportTree(treeLayerId, treeConfigId, billboardData) {
  const foundLayer = openProject.trees.find(tl => tl.id === treeLayerId);
  const foundConfig = foundLayer.treeConfigs.find(cfg => cfg.id === treeConfigId);
  // write file data to disk
  const imageryFolder = path.join(openProject._workingDir, IMAGERY_DIR);
  // if (!fs.existsSync(imageryFolder)) {
  //   fs.mkdirSync(imageryFolder);
  // }
  const billboardFilename = `tree-${treeConfigId}.png`;
  const outputTexture = path.join(imageryFolder, billboardFilename);
  let outputData;
  if (typeof billboardData.buffer === 'string') {
    outputData = Buffer.from(billboardData.buffer.split('base64,')[1], 'base64');
  }
  if (outputData) {
    console.log(`Writing file: ${outputTexture}`, outputData);
    await fs.promises.writeFile(outputTexture, outputData);
    foundConfig.billboard = {
      size: billboardData.size,
      filePath: outputTexture,
      uri: `${PROJECT_FILE_PROTOCOL}:///${path.join(IMAGERY_DIR, billboardFilename)}`
    };
  }
  await saveProjectSettings();  
  return openProject.trees;
}

export async function importTree(treeLayerId) {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open Tree Model',
    filters: [{ name: 'Tree Model', extensions: ['glb'] }]
  });
  if (canceled || !filePaths?.length) {
    return;
  }
  const treeConfigId = randomUUID();
  const config = {
    url: `${PROJECT_FILE_PROTOCOL}://${TREE_IMPORT_PREFIX}/${treeConfigId}.glb`,
    filePath: filePaths[0],
    id: treeConfigId,
    randomSeed: 12345,
    scaleRange: { min: 0.6, max: 1.8 },
    density: 0.2
  };
  // console.log(`Adding imported tree ${treeConfigId} to layer: ${treeLayerId}`, config);
  const foundLayer = openProject.trees.find(tl => tl.id === treeLayerId);
  if (foundLayer) {
    foundLayer.treeConfigs = [
      ...(foundLayer.treeConfigs || []),
      config
    ];
  }
  // return config;
  await saveProjectSettings();
  return openProject.trees;
  // broadcast('project.opened', openProject); 
}

export function findTreeConfigById(treeConfigId) {
  for (const layer of openProject.trees) {
    if (layer.treeConfigs) {
      for (const config of layer.treeConfigs) {
        if (config.id === treeConfigId) {
          return config;
        }
      }
    }
  }
}

export async function updateHoleByNumber(holeNumber, update) {
  log.debug(`updateHoleByNumber: ${holeNumber}`, update);
  const existing = openProject.holes.get(holeNumber);
  if (!existing) {
    log.debug(`Hole doesn't exist yet! ${holeNumber}`, update);
  }
  if (!update) {
    console.log(`remove hole: ${holeNumber}`);
    openProject.holes.delete(holeNumber);
  } else {
    console.log('update hole!', update);
    openProject.holes.set(holeNumber, _.merge(existing, update));
  }

  await saveProjectSettings();
  broadcast('project.opened', openProject); 
}

export async function updateScene(update) {
  const updatedScene = _.merge({ ...openProject.scene }, update);
  const changed = !_.isEqual(updatedScene, openProject.scene);
  if (changed) {
    console.log('Project scene changed!');
    openProject.scene = updatedScene;
    await saveProjectSettings();
  // } else {
    // console.log('Project scene NOT changed!');
    // console.log('     vs', updatedScene);
    // console.log('-------------- - - - -');
  }
  return openProject;
}

