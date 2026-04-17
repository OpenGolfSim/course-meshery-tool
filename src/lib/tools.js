import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { pipeline } from 'stream';
import { promisify } from 'util';
import got from 'got';
import { app } from 'electron';
import { resourceRoot } from './utils.js';
import { broadcast } from './window.js';
import tar from 'tar';
import extractZip from 'extract-zip';

const pipelineAsync = promisify(pipeline)

const USER_AGENT = 'OGSMeshery';

// const TOOLS_DIR = path.join(resourceRoot(), 'python', 'tools');
// const PDAL_BIN = path.join(PYTHON_ENV, 'bin', 'pdal');

const REPO = 'OpenGolfSim/course-python-tools';

let installState = {
  phase: 'init',
  installed: false,
  finished: false,
  active: false,
  progress: 0,
  status: 'Idle'
};

const REQUIRED_BINARIES = [
  'pdal',
  'gdalwarp',
  'gdal_fillnodata',
  'gdal_translate',
  'gdaldem'
];

function sleep(wait) {
  return new Promise(resolve => setTimeout(resolve, wait));
}

function selectAsset(assets) {
  const assetMap = {
    win32: 'windows',
    darwin: 'macos-arm64',
  };
  const assetMatch = assetMap?.[process.platform];
  if (!assetMatch) {
    throw new Error('Unsupported platform');
  }
  return assets.find(asset => asset.name.includes(assetMatch));
}

async function getLatestRelease() {
  const release = await got.get(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    {
      headers: { 'User-Agent': USER_AGENT }
    }
  ).json();
  return {
    version: release.tag_name,
    asset: selectAsset(release.assets),
  };
}

function updateInstallState(update) {
  installState = { ...installState, ...update };
  broadcast('installState', installState);  
}

async function downloadAsset(asset, tmpArchive, onProgress) {
  if (!asset.browser_download_url) {
    throw new Error('Unable to find valid download URL');
  }
  console.log(`Downloading ${asset.browser_download_url} to ${tmpArchive}`);
  const downloadStream = got.stream(asset.browser_download_url, {
    headers: { 'User-Agent': USER_AGENT },
    // got auto-follows redirects by default, which matters for GitHub asset URLs
  })

  downloadStream.on('downloadProgress', ({ transferred, total, percent }) => {
    console.log(`Downloading ${transferred} of ${total}`);
    if (onProgress && total) {
      onProgress({
        phase: 'download',
        downloaded: transferred,
        total,
        progress: percent * 100,
      })
    }
  });
  await pipelineAsync(downloadStream, fs.createWriteStream(tmpArchive));
  console.log(`Download finished!`);
}

async function extractArchive(archivePath, outDir) {
  const format = path.extname(archivePath);
  console.log(`extracting... ${entry.path}`);

  if (format === 'gz') {
    await tar.x({
      file: archivePath,
      cwd: outDir,
      onentry: (entry) => {
        console.log(`extracting... ${entry.path}`);
        // tar doesn't give a percentage, but you can at least show activity
        // onProgress?.({ phase: 'extract', file: entry.path })
      },
    })
  } else if (format === 'zip') {
    await extractZip(archivePath, {
      dir: outDir,
      onEntry: (entry, zipfile) => {
        // zipfile has entryCount and entriesRead for progress
        const percent = (zipfile.entriesRead / zipfile.entryCount) * 100
        console.log(`extracting... ${percent} (${zipfile.entriesRead} of ${zipfile.entryCount})`);
        // onProgress?.({
        //   phase: 'extract',
        //   percent,
        //   file: entry.fileName,
        // });
      },
    })
  } else {
    throw new Error(`Unknown archive format: ${format}`)
  }
}

export async function installStart() {
  
  try {
    updateInstallState({ active: true, phase: 'download', progress: 0, status: 'Downloading tools...' })
    
    // download release
    
    const release = await getLatestRelease();
    console.log('release', release);
    if (!release?.asset?.url) {
      throw new Error('Unable to find tools package in release');
    }
    const tmpArchive = path.join(app.getPath('temp'), release.asset.name);
    const baseDir = getToolsDir();
  
    await sleep(2000);
    // await downloadAsset(release.asset, tmpArchive, (progress) => {
    //   updateInstallState({ progress })
    // });
  
    updateInstallState({ active: true, phase: 'extract', progress: 25, status: 'Extracting tools...' })
    await sleep(2000);
    // await extractArchive(tmpArchive, baseDir);
  
    updateInstallState({ active: true, phase: 'install', progress: 75, status: 'Installing tools...' })
    await sleep(2000);
    // await condaUnpack(baseDir);
  
    updateInstallState({ active: false, finished: true, phase: 'complete', progress: 100, status: 'Installation complete' });

  } catch (error) {
    updateInstallState({ active: false, finished: true, phase: 'error', status: 'Error', error: error.message || `${error}` });
  }
}

export function checkInstallState() {
  const baseDir = getToolsDir();
  installState.installed = REQUIRED_BINARIES.every(binName => {
    const binPath = getBin(binName);
    return fs.existsSync(binPath);
  });
  return installState;
}

function getToolsDir() {
  // Development: use app.getAppPath() instead of __dirname
  // __dirname is rewritten by webpack to .webpack/main — don't use it here
  // return path.join(app.getAppPath(), 'tools', platform)
  return path.join(resourceRoot(), 'python', 'tools');
}

async function condaUnpack(baseDir) {
  // conda-unpack lives in a different folder on each platform
  const unpackBin = process.platform === 'win32'
    ? path.join(baseDir, 'Scripts', 'conda-unpack.exe')
    : path.join(baseDir, 'bin', 'conda-unpack')

    if (!fs.existsSync(unpackBin)) {
    throw new Error(`conda-unpack not found at ${unpackBin}`)
  }
  // conda-unpack rewrites shebangs and patches dylib/DLL paths to be relative
  // so the env works regardless of where it was extracted. Can take 10-30s.
  await new Promise((resolve, reject) => {
    const proc = spawn(unpackBin, [], { cwd: baseDir })
    proc.stdout.on('data', (d) => console.log('[conda-unpack]', d.toString().trim()))
    proc.stderr.on('data', (d) => console.warn('[conda-unpack]', d.toString().trim()))
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`conda-unpack exited with code ${code}`))
    })
    proc.on('error', reject)
  })
}

export function getBin(name) {
  const dir = getToolsDir()
  const exe = process.platform === 'win32' ? `${name}.exe` : name
  return path.join(dir, 'bin', exe);
}

export function getSpawnEnv() {
  const dir = getToolsDir()
  return {
    ...process.env,
    PROJ_LIB: path.join(dir, 'share', 'proj'),
    GDAL_DATA: path.join(dir, 'share', 'gdal'),
    ...(process.platform === 'win32' && {
      PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`
    })
    // GDAL_DATA: path.join(dir, 'gdal-data'),
    // PROJ_DATA: path.join(dir, 'proj-data'),
    // // Windows: DLLs must be findable on PATH
    // ...(process.platform === 'win32' && {
    //   PATH: `${dir};${process.env.PATH}`,
    // }),
  }
}
