import React, { useState } from 'react';
import { AppBar, Box, Tab, Tabs, Typography, useTheme } from "@mui/material";
import TerrainIcon from '@mui/icons-material/Terrain';
import DrawIcon from '@mui/icons-material/Draw';
import CourseIcon from '@mui/icons-material/Map';
// import {
//   MemoryRouter,
//   Route,
//   Routes,
//   Link,
//   matchPath,
//   useLocation,
//   StaticRouter,
// } from 'react-router';
// import Terrain from '../pages/Terrain.jsx';
import Map from '../pages/Map.jsx';
import Course from '../pages/Course.jsx';
import { TopNavTab, TopNavTabs } from './Tabs.jsx';
import { useProject } from '../contexts/Project.jsx';
import Welcome from '../pages/Welcome.jsx';
import { MesheryProvider } from '../contexts/Meshery.jsx';
import { useInstaller } from '../contexts/Installer.jsx';
import Install from '../pages/Install.jsx';

const routes = [
  {
    name: 'Map',
    href: 'map',
    icon: <CourseIcon />,
  },
  {
    name: 'Meshes',
    href: 'lidar',
    icon: <TerrainIcon />,
  }
];


function CustomTabPanel(props) {
  const { children, value, index, style, ...other } = props;

  return (
    <div
      role="tabpanel"
      style={{ width: '100%', height: 'calc(100% - 45px)' }}
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && children}
    </div>
  );
}

export default function Workarea() {
  const { installState } = useInstaller();
  const { project } = useProject();
  const [currentTab, setCurrentTab] = useState(0);
  const handleChange = (event, newValue) => {
    setCurrentTab(newValue);
  };

  if (!installState?.installed) {
    return (
      <Install />
    )
  }
  if (!project._workingDir) {
    return (
      <Welcome />
    )
  }

  return (
    <Box sx={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <AppBar position="static">
        <TopNavTabs
          value={currentTab}
          onChange={handleChange}
          indicatorColor="primary"

          textColor="inherit"
          variant="fullWidth"
          aria-label="full width tabs example"
        >
          {routes.map((route, index) => (
            <TopNavTab
              key={route.href}
              icon={route.icon}
              iconPosition="start"
              label={route.name}
            />
          ))}
        </TopNavTabs>
      </AppBar>

      <CustomTabPanel value={currentTab} index={0}>
        <Map />
      </CustomTabPanel>
      
      {/* <MesheryProvider> */}
        <CustomTabPanel value={currentTab} index={1}>
          <Course />
        </CustomTabPanel>
      {/* </MesheryProvider> */}
    </Box>
  )
}