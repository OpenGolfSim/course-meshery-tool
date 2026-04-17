import path from 'path';
import fs from 'fs';
import * as _ from 'lodash';
import { dialog, ipcMain } from 'electron';
import logger from 'electron-log';
import { broadcast, mainWindow } from './window';
import { addToRecent } from './app';
import { generateSVG, geoJSONToSvgPaths, parseSVG, storedPathsToSVG } from './svg';
import { parseRaw } from './heightmap';
import { svgToCourseLayers } from './workers';

const log = logger.scope('PROJECT');

const defaultProjectSettings = {
  centerPoint: null,
  distance: 1
};

export let openProject = {
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
  settings: defaultProjectSettings
};


function setDirty() {
  openProject._dirty = true;
  mainWindow.setTitle(`${openProject.name} (unsaved) - Meshery`);
}

function setClean() {
  openProject._dirty = false;
  mainWindow.setTitle(`${openProject.name} - Meshery`);
}

export async function storeSettings(settings) {
  const changed = !_.isEqual(settings, openProject.settings);
  if (changed) {
    openProject.settings = settings;
    await saveProjectSettings();
    console.log('store project settings', settings);
  }
  // setDirty();
}

export function getSettings() {
  return openProject.settings;
}

async function parseRawData() {
  try {
    if (!openProject.raw?.filePath) {
      throw new Error(`No raw file generated yet`);
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

  log.info('Generating course polygons from SVG...');
  // openProject.$meshLayers = [...layers];
  svgToCourseLayers({ layers: openProject._layers, settings: openProject.settings }).then((courseLayers) => {
    // openProject.$meshLayers = courseLayers;
    openProject._layers = courseLayers;
    // broadcast('meshLayers', openProject.$meshLayers);
    broadcast('project.opened', openProject);
  }).catch(error => {
    log.error(error);
  });  
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
  setClean();

  addToRecent(openProject);

  return openProject;
  // const folder = await createProjectFolder();
  // if (!folder) {
  //   return;
  // }
}


export async function loadProjectFile(filePath) {
  const stored = JSON.parse(fs.readFileSync(filePath).toString());
  const filePathInfo = path.parse(filePath);
  openProject = {
    name: filePathInfo.name,
    _dirty: false,
    _filePath: filePath,
    _workingDir: filePathInfo.dir,
    ...stored
  }

  await refreshSVG();
  await refreshRawData();

  setClean();
  broadcast('project.opened', openProject);
}

export async function open() {
  const { canceled, filePath } = await dialog.showOpenDialog({
    title: 'Open Meshery Project',
    filters: [{ name: 'Meshery Project File', extensions: ['meshery'] }]
  });
  if (!canceled && filePath) {
    console.log(`Opened: ${filePath}`);
    loadProjectFile(filePath);
  }
}

export async function saveProjectSettings() {
  if (!openProject._filePath) {
    return;
  }
  const outputProject = _.omitBy(openProject, (value, key) => key.startsWith('_'));
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