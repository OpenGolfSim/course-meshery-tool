import path from 'node:path';
import fs from 'node:fs';
import { openProject } from '../project';
import { CACHE_DIR } from '../../constants';

export function ensureCacheFolder() {
  if (!openProject._workingDir) {
    return;
  }
  const cacheFolder = path.join(openProject._workingDir, CACHE_DIR);
  if (!fs.existsSync(cacheFolder)) {
    fs.mkdirSync(cacheFolder);
  }
  return cacheFolder;
}