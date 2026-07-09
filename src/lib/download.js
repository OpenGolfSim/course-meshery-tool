import fs from 'fs';
import logger from 'electron-log';
import { pipeline } from 'stream';
import { promisify } from 'util';
import got from 'got';
import { filesize } from 'filesize';

const log = logger.scope('INSTALL');

const pipelineAsync = promisify(pipeline)

export const USER_AGENT = 'OGSMeshery';


export class CancelledError extends Error {
  constructor() {
    super('Operation cancelled')
    this.name = 'CancelledError'
    this.cancelled = true
  }
}


export async function downloadAsset(downloadUrl, destination, signal, onProgress) {
  if (signal?.aborted) throw new CancelledError();

  if (!downloadUrl) {
    throw new Error('Unable to find valid download URL');
  }
  log.info(`Downloading ${downloadUrl} to ${destination}`);
  const downloadStream = got.stream(downloadUrl, {
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
    await pipelineAsync(downloadStream, fs.createWriteStream(destination));
    log.info(`Download finished!`);
  } catch (err) {
    if (signal?.aborted) throw new CancelledError();
    throw err;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
