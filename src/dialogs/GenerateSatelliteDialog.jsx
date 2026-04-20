import React, { useCallback, useEffect, useState } from 'react';
import CheckIcon from '@mui/icons-material/CheckCircle';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, CircularProgress, Alert, Grid, TextField, MenuItem, Stack } from '@mui/material';
import { useProject } from '../contexts/Project';

export default function GenerateSatelliteDialog(props) {
  const { onClose, open } = props;
  const { generateSatellite } = useProject();
  const [source, setSource] = useState('google');
  const [job, setJob] = useState({ progress: 0, state: 0 });

  const handleSourceChange = useCallback(async (event) => {
    setSource(event.target.value);
  }, []);

  const handleSave = useCallback(async () => {
    console.log('save it!');
    setJob(old => ({ ...old, state: 1, progress: 0 }));
    const result = await generateSatellite(source);
    console.log('save it!', result);
    setJob(old => ({ ...old, state: 2, progress: 100 }));
    // if (onClose) onClose();
  }, [source]);

  const handleCancel = useCallback(() => {
    if (job.state !== 1) {
      props.onClose();
    }
  }, [job]);

  const handleProgressUpdate = useCallback(async (evt, update) => {
    console.log('update progress', update);
    setJob(old => ({ ...old, progress: update.progress }));
  }, []);

  useEffect(() => {
    window.meshery.on('imagery.progress', handleProgressUpdate);
    return () => {
      window.meshery.off('imagery.progress', handleProgressUpdate);
    }
  }, []);
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
        {job.state === 0 ? (
          <Stack spacing={5}>
            <Alert severity="info">Tip: You can preview the different satellite imagery on the map by changing the map layers before export.</Alert>

              <TextField fullWidth label="Satellite Source" select={true} value={source} onChange={handleSourceChange}>
                <MenuItem value="google">Google Satellite</MenuItem>
                <MenuItem value="bing">Bing Satellite</MenuItem>
                <MenuItem value="arcgis">ArcGIS WorldImagery</MenuItem>
              </TextField>

          </Stack>
        ) : null}
        {job.state === 1 ? (
          <Stack spacing={3} sx={{ justifyItems: 'center', alignItems: 'center' }}>
            <CircularProgress variant="determinate" value={job.progress} />
            <Typography>Downloading satellite imagery...</Typography>
          </Stack>
        ) : null}

        {job.state === 2 ? (
          <Stack spacing={3} sx={{ justifyItems: 'center', alignItems: 'center' }}>
            <Box>
              <CheckIcon color="success" sx={{ fontSize: 48 }} />
            </Box>
            <Typography color="textSecondary">Satellite processing completed</Typography>
          </Stack>
        ) : null}

      </DialogContent>

      <DialogActions sx={{ display: 'flex', flexDirection: 'row' }}>
        <Button
          fullWidth
          variant="text"
          color="inherit"
          onClick={handleCancel}
        >
          {job.state === 2 ? 'Done' : 'Cancel'}
        </Button>
        <Button
          fullWidth
          disabled={job.state}
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