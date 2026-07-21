import React from 'react';
import { Box, Typography } from "@mui/material";
import MapBox from '../components/MapBox.jsx';

export default function Terrain() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'row', height: '100%' }}>
      <Box sx={{ width: 220, flexGrow: 0, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        tools
      </Box>
      <Box sx={{ flex: 1 }}>
        <MapBox distance={1} outerDistance={2} />
      </Box>
    </Box>
  )
}