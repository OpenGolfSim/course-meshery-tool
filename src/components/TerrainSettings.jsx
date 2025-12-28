import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Typography, TextField, List, Chip, Stack, Tooltip } from '@mui/material';
import { useMeshery } from '../contexts/Meshery.jsx';

export default function TerrainSettings() {
  const { settings, setSettings } = useMeshery();
  const debounceRef = useRef();
  const [tempHeight, setTempHeight] = useState(settings.heightScale);
  const [tempSmooth, setTempSmoothing] = useState(settings.terrainSmoothingRadius);

  const handleScaleUpdate = useCallback((e) => {
    // const heightScaleValue = e.target.value;
    // console.log(heightScaleValue);
    const val = e.target.value;
    setTempHeight(val);
    // setSettings(({ ...settings, heightScale: parseInt(val, 10)}));
  }, [settings]);

  const handleSmoothingUpdate = useCallback((e, key) => {
    // const smoothingValue = parseInt(e.target.value, 10);
    const val = e.target.value;
    setTempSmoothing(val);
      // setSettings(({ ...settings, terrainSmoothingRadius: parseInt(val, 10)}));
  }, [settings]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      console.log('changed');
      setSettings(old => ({
        ...old,
        heightScale: parseInt(tempHeight, 10),
        terrainSmoothingRadius: parseInt(tempSmooth, 10)
      }));
    }, 800);
  }, [tempHeight, tempSmooth]);

  return (
    <>
      {/* <Typography sx={{ mb: 3 }} variant="h5" color="textSecondary">Settings</Typography> */}
      {/* <Stack spacing={4} direction="row"> */}
        {/* <Tooltip title="The height scale of your terrain data. This can be found in your Course Terrain Tool stats file or from your Unity terrain settings"> */}
          <TextField
            // fullWidth={true}
            sx={{ width: 100 }}
            label="Terrain Height (m)"
            type="number"
            // disabled={!settings.rawFilePath}
            // helperText="This can be found in your Course Terrain Tool stats file or from your Unity terrain settings"
            value={tempHeight}
            size="small"
            onChange={handleScaleUpdate}
          />
        {/* </Tooltip> */}
        
        <TextField
          // fullWidth={true}
          sx={{ width: 100 }}
          label="Terrain Smoothing"
          type="number"
          value={tempSmooth}
          size="small"
          onChange={handleSmoothingUpdate}
        />
      {/* </Stack> */}

    </>    
  )
}