import * as React from 'react';
import { createRoot } from 'react-dom/client';
import Workarea from './components/Workarea.jsx';
import { ProjectProvider } from './contexts/Project.jsx';
import { InstallerProvider } from './contexts/Installer.jsx';
import MesheryTheme from './theme/MesheryTheme.jsx';


const root = createRoot(document.body);
root.render(
  <MesheryTheme>
    <InstallerProvider>
      <ProjectProvider>
        <Workarea />
      </ProjectProvider>
    </InstallerProvider>
  </MesheryTheme>
);