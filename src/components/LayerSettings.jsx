import React, { useState } from 'react';
import { Box, Typography, TextField, List, Chip } from '@mui/material';
import { useMeshery } from '../contexts/Meshery.jsx';

export default function LayerSettings() {
  const { settings, setSettings } = useMeshery();
  
  const handleScaleUpdate = (e) => {
    const heightScaleValue = e.target.value;
    console.log(heightScaleValue);
    setSettings(old => ({ ...old, heightScale: e.target.value }));
  }

  return (
    <Box sx={{ px: 2, flexGrow: 0, flexShrink: 0 }}>
      <Typography sx={{ mb: 1 }} variant="h5" color="textSecondary">Settings</Typography>
      <TextField
        sx={{ mt: 2 }}
        fullWidth={true}
        label="Height Scale (m)"
        value={settings.heightScale}
        size="small"
        onChange={handleScaleUpdate}
      />

    </Box>    
  )
}