import React, { useCallback, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, CircularProgress, Alert, Grid, TextField, MenuItem, Stack } from '@mui/material';
import { useProject } from '../contexts/Project';

export default function GenerateSatelliteDialog(props) {
  const { onClose, open } = props;
  const { generateSatellite } = useProject();
  const [source, setSource] = useState('google');

  const handleSourceChange = useCallback(async (event) => {
    setSource(event.target.value);
  }, []);

  const handleSave = useCallback(async () => {
    console.log('save it!');
    const result = await generateSatellite(source);
    console.log('save it!', result);
    if (onClose) onClose();
  }, [source]);
  return (
    <Dialog
      fullWidth={true}
      maxWidth="sm"
      onClose={onClose}
      open={open}
    >
      <DialogTitle>
        Generate Satellite Imagery
      </DialogTitle>
      <DialogContent>
        <Stack spacing={5}>
          <Alert severity="info">Tip: You can preview the different satellite imagery on the map by changing the map layers before export.</Alert>

            <TextField fullWidth label="Satellite Source" select={true} value={source} onChange={handleSourceChange}>
              <MenuItem value="google">Google Satellite</MenuItem>
              <MenuItem value="bing">Bing Satellite</MenuItem>
              <MenuItem value="arcgis">ArcGIS WorldImagery</MenuItem>
            </TextField>

        </Stack>
      </DialogContent>

      <DialogActions sx={{ display: 'flex', flexDirection: 'row' }}>
        <Button
          fullWidth
          variant="text"
          color="inherit"
          onClick={props.onClose}
        >
          Cancel
        </Button>
        <Button
          fullWidth
          variant="contained"
          color="primary"
          onClick={handleSave}
        >
          Generate Satellite
        </Button>
      </DialogActions>
       
    </Dialog>
  );
}