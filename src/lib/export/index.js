import { dialog, shell } from 'electron';
import path from 'path';
import { openProject, meshData } from '../project';
import { write as writeGLTF } from './gltf';
import { write as writeOBJ } from './obj';

export async function exportMeshes(exportSettings, imageData) {

  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Save SVG',
    defaultPath: path.join(openProject._workingDir, `course.${exportSettings.format}`),
    // nameFieldLabel: 'Course Folder Name',
    // message: 'Create your project folder',
    buttonLabel: `Save ${exportSettings.format}`,
  });
  if (!filePath || canceled) {
    console.log('No file was selected');
    return;
  }
  console.log('save all layers to ', filePath);
  // console.log('save all layers to ', openProject._layers);
  // console.log('save all layers to ', meshData);

  switch (exportSettings.format) {
    case 'obj':
      await writeOBJ(filePath, openProject._meshes, meshData);
      break;
    case 'gltf':
    case 'glb':
      await writeGLTF(filePath, openProject, meshData, imageData);
      break;
    default:
      throw new Error(`Unknown format ${exportSettings.format}`);
  }
  
  shell.showItemInFolder(filePath);

}