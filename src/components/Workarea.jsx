import React, { useState, useEffect } from 'react';
import { AppBar, Box, Tab, Tabs, Typography, useTheme } from "@mui/material";
import TerrainIcon from '@mui/icons-material/Terrain';
import DrawIcon from '@mui/icons-material/Draw';
import CourseIcon from '@mui/icons-material/Map';
import Map from '../pages/Map.jsx';
import Course from '../pages/Course.jsx';
import { TopNavTab, TopNavTabs } from './Tabs.jsx';
import { useProject } from '../contexts/Project.jsx';
import Welcome from '../pages/Welcome.jsx';
import { useInstaller } from '../contexts/Installer.jsx';
import Install from '../pages/Install.jsx';

const routes = [
  {
    name: 'Map',
    href: 'map',
    icon: <CourseIcon />,
  },
  {
    name: 'Course',
    href: 'lidar',
    icon: <TerrainIcon />,
  }
];


function CustomTabPanel(props) {
  const { children, value, index, style, keepMounted = false, ...other } = props;
  const active = value === index;
  const [visited, setVisited] = useState(active);
  useEffect(() => { if (active) setVisited(true); }, [active]);
  const shouldRender = keepMounted ? visited : active;

  return (
    <div
      role="tabpanel"
      aria-hidden={!active}
      style={{
        position: 'absolute',
        inset: 0,
        // Keep layout size while hidden so FUSE's ResizeObserver never sees 0x0
        visibility: active ? 'visible' : 'hidden',
        pointerEvents: active ? 'auto' : 'none',
      }}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {shouldRender && children}
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

      <Box sx={{ position: 'relative', width: '100%', height: 'calc(100% - 45px)' }}>
        <CustomTabPanel value={currentTab} index={0}>
          <Map />
        </CustomTabPanel>

        <CustomTabPanel value={currentTab} index={1} keepMounted>
          <Course active={currentTab === 1} />
        </CustomTabPanel>
      </Box>
    </Box>
  )
}