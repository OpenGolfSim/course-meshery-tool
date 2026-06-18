import fs from 'fs';
import path from 'path';
import logger from 'electron-log';
import { spawn } from 'child_process';
import { pipeline } from 'stream';
import { promisify } from 'util';
import got from 'got';
import { filesize } from 'filesize';
import { app } from 'electron';
import { resourceRoot } from './utils.js';
import { broadcast } from './window.js';
import * as tar from 'tar';
import extractZip from 'extract-zip';
import { getToolsPath } from './app.js';

const pipelineAsync = promisify(pipeline)

const log = logger.scope('INSTALL');

const USER_AGENT = 'OGSMeshery';
let abortSignal;
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

const REQUIRED_BINARIES = {
  pdal: {
    windowsPath: 'Library/bin',
  },
  gdalwarp: {
    windowsPath: 'Library/bin',
  },
  gdal_fillnodata: {
    windowsPath: 'Scripts',
  },
  gdal_translate: {
    windowsPath: 'Library/bin',
  },
  gdaldem: {
    windowsPath: 'Library/bin',
  }
};


class CancelledError extends Error {
  constructor() {
    super('Operation cancelled')
    this.name = 'CancelledError'
    this.cancelled = true
  }
}

// Helper: throw if the signal has been aborted
function throwIfAborted(signal) {
  if (signal?.aborted) throw new CancelledError()
}

function sleep(wait) {
  return new Promise(resolve => setTimeout(resolve, wait));
}

function selectAsset(assets) {
  if (process.platform === 'win32') {
    return assets.find(asset => asset.name.includes('python-env-windows'));
  } else if (process.platform === 'darwin' && process.arch === 'x64') {
    return assets.find(asset => asset.name.includes('python-env-macos-x64'));
  } else if (process.platform === 'darwin' && process.arch === 'arm64') {
    return assets.find(asset => asset.name.includes('python-env-macos-arm64'));
  } else {
    throw new Error('Unsupported platform');
  }
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
  installState = {
    ...installState,
    ...update
  };
  broadcast('installState', installState);  
}

async function downloadAsset(asset, tmpArchive, signal, onProgress) {
  throwIfAborted(signal);
  if (!asset.browser_download_url) {
    throw new Error('Unable to find valid download URL');
  }
  log.info(`Downloading ${asset.browser_download_url} to ${tmpArchive}`);
  const downloadStream = got.stream(asset.browser_download_url, {
    headers: { 'User-Agent': USER_AGENT },
    // got auto-follows redirects by default, which matters for GitHub asset URLs
  })

  downloadStream.on('downloadProgress', ({ transferred, total, percent }) => {
    // console.log(`Downloading ${transferred} of ${total}`);
    if (onProgress && total) {
      onProgress({
        // phase: 'download',
        // downloaded: transferred,
        // total,
        progress: percent * 100,
        status: `Downloading ${filesize(transferred)} of ${filesize(total)}`
      })
    }
  });

  // Abort the HTTP stream when the signal fires
  const onAbort = () => downloadStream.destroy(new CancelledError());
  signal.addEventListener('abort', onAbort);
  
  try {
    await pipelineAsync(downloadStream, fs.createWriteStream(tmpArchive));
    log.info(`Download finished!`);
  } catch (err) {
    if (signal?.aborted) throw new CancelledError();
    throw err;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

async function extractArchive(archivePath, outDir, signal, onProgress) {
  throwIfAborted(signal);
  const format = path.extname(archivePath);
  
  log.info(`Extracting ${format}...`);

  if (format === '.gz') {
    if (onProgress) { onProgress({ progress: -1, status: 'Extracting tools' }); }    

    await tar.x({
      file: archivePath,
      cwd: outDir,
      onentry: (entry) => {
        if (signal?.aborted) {
          // Destroying the entry stream halts extraction
          entry.destroy(new CancelledError())
        }
        // console.log(`extracting... ${entry.path}`);
        // tar doesn't give a percentage, but you can at least show activity
        // onProgress?.({ phase: 'extract', file: entry.path })
      },
    }).catch((err) => {
      if (signal?.aborted) throw new CancelledError();
      throw err;
    });
  } else if (format === '.zip') {
    await extractZip(archivePath, {
      dir: outDir,
      onEntry: (entry, zipfile) => {
        if (signal?.aborted) {
          throw new CancelledError();
        }
        // zipfile has entryCount and entriesRead for progress
        const percent = (zipfile.entriesRead / zipfile.entryCount) * 100
        // console.log(`extracting... ${percent} (${zipfile.entriesRead} of ${zipfile.entryCount})`, entry);
        if (onProgress) {
          onProgress({
            progress: percent,
            status: `Extracting ${zipfile.entriesRead} of ${zipfile.entryCount}`,
          });
        }
      },
    }).catch((err) => {
      if (err instanceof CancelledError || signal?.aborted) throw new CancelledError()
      throw err
    });
  } else {
    throw new Error(`Unknown archive format: ${format}`)
  }
  throwIfAborted(signal);
}

export async function installCancel() {
  if (abortSignal) {
    abortSignal.abort();
  }
}

export async function installStart() {
  let tmpArchive;

  try {
    updateInstallState({ active: true, phase: 'download', progress: 0, status: 'Downloading tools...' })
    
    // download release
    
    const release = await getLatestRelease();
    if (!release?.asset?.url || !release?.asset?.name) {
      throw new Error('Unable to find tools package in release');
    }
    tmpArchive = path.join(app.getPath('temp'), release.asset.name);
    // const baseDir = getToolsDir();
    const baseDir = getToolsPath();
    abortSignal = new AbortController();
    // await sleep(2000);
    await downloadAsset(release.asset, tmpArchive, abortSignal.signal, (update) => {
      updateInstallState({ progress: update.progress, status: update.status });
    });
  
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir);
    }
    updateInstallState({ active: true, phase: 'extract', progress: 0, status: 'Extracting tools...' })
    // await sleep(2000);
    await extractArchive(tmpArchive, baseDir, abortSignal.signal, (update) => {
      updateInstallState({ progress: update.progress, status: update.status });
    });
  
    updateInstallState({ active: true, phase: 'install', progress: -1, status: 'Installing tools...' })
    // await sleep(2000);
    await condaUnpack(baseDir, abortSignal.signal);
  
    updateInstallState({ active: false, finished: true, phase: 'complete', progress: 100, status: 'Installation complete' });


  } catch (error) {
    if (error instanceof CancelledError) {
      return updateInstallState({ active: false, cancelled: true, finished: false, status: 'Canceled' });
    }
    updateInstallState({ active: false, finished: true, phase: 'error', status: 'Error', error: error.message || `${error}` });
  } finally {
    if (tmpArchive && fs.existsSync(tmpArchive)) {
      fs.unlinkSync(tmpArchive);
    }
  }
}

export function isInstalled() {
  return Object.keys(REQUIRED_BINARIES).every(binName => {
    const binPath = getBin(binName);
    const e = fs.existsSync(binPath);
    return e;
  });
}
export function checkInstallState() {
  installState.installed = isInstalled();
  installState.requiredSpace = process.platform === 'win32' ? '2GB' : '1GB';
  return installState;
}

function getToolsDir() {
  // Development: use app.getAppPath() instead of __dirname
  // __dirname is rewritten by webpack to .webpack/main — don't use it here
  // return path.join(app.getAppPath(), 'tools', platform)
  return path.join(resourceRoot(), 'python', 'tools');
}

async function condaUnpack(baseDir, signal) {
  throwIfAborted(signal)

  let cmd, args
  if (process.platform === 'win32') {
    cmd = path.join(baseDir, 'Scripts', 'conda-unpack.exe')
    args = []
  } else {
    cmd = path.join(baseDir, 'bin', 'python')
    args = [path.join(baseDir, 'bin', 'conda-unpack')]
  }

  if (!fs.existsSync(cmd)) {
    throw new Error(`${cmd} not found`)
  }

  log.info('Running conda unpacking');
  await new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd: baseDir });
    const onAbort = () => {
      proc.kill('SIGTERM')
      // Give it a moment, then hard-kill
      setTimeout(() => proc.kill('SIGKILL'), 2000)
    }
    signal?.addEventListener('abort', onAbort);
    proc.stdout.on('data', (d) => log.info('[conda-unpack]', d.toString().trim()))
    proc.stderr.on('data', (d) => log.warn('[conda-unpack]', d.toString().trim()))
    proc.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort)
      if (signal?.aborted) return reject(new CancelledError())
      if (code === 0) resolve()
      else reject(new Error(`conda-unpack exited with code ${code}`));
    })
    proc.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
  })
}

export function getBin(name) {
  // const dir = getToolsDir();
  const dir = getToolsPath();
  
  const pref = REQUIRED_BINARIES?.[name];
  let binDir = 'bin';
  if (process.platform === 'win32' && pref?.windowsPath) {
    binDir = pref.windowsPath;
  }
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return path.join(dir, binDir, exe);
}

export function getSpawnEnv() {
  // const dir = getToolsDir()
  const dir = getToolsPath()
  return {
    ...process.env,
    ...(process.platform === 'win32' ? {
      PROJ_LIB: path.join(dir, 'Library', 'share', 'proj'),
      GDAL_DATA: path.join(dir, 'Library', 'share', 'gdal'),
      PATH: `${path.join(dir, 'Library', 'bin')}${path.delimiter}${path.join(dir, 'Scripts')}${path.delimiter}${process.env.PATH}`
      // PATH: `${path.join(dir, 'Library', 'bin')}:${process.env.PATH}`
    } : {
      PROJ_LIB: path.join(dir, 'share', 'proj'),
      GDAL_DATA: path.join(dir, 'share', 'gdal'),
      PATH: `${path.join(dir, 'bin')}${path.delimiter}${process.env.PATH}`
    })
    // GDAL_DATA: path.join(dir, 'gdal-data'),
    // PROJ_DATA: path.join(dir, 'proj-data'),
    // // Windows: DLLs must be findable on PATH
    // ...(process.platform === 'win32' && {
    //   PATH: `${dir};${process.env.PATH}`,
    // }),
  }
}
