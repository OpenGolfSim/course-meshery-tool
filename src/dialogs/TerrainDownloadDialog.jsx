import React from 'react';
import { Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, Stack, CircularProgress, Alert } from '@mui/material';
import CheckIcon from '@mui/icons-material/CheckCircle';
import NumericInput from '../components/NumericInput.jsx';
import NumberField from '../components/NumberField.jsx';
import { useProject } from '../contexts/Project.jsx';

export default function TerrainDownloadDialog(props) {
  const { handleDownloadCourse } = useProject();
  const downloadStates = {
    init: 0,
    downloading: 1,
    complete: 2,
    error: 3,
  }
  const { onClose, open, data, layerRef } = props;
  const [resolution, setResolution] = React.useState(1);
  const [downloadState, setDownloadState] = React.useState(downloadStates.init);
  const [downloadError, setDownloadError] = React.useState(null);

  const handleResolutionChange = React.useCallback((val) => {
    setResolution(val);
  }, []);

  const handleCancel = React.useCallback(async () => {
    if (downloadState === downloadStates.downloading) {
      // cancel
    }
    if (onClose) onClose();
  }, [downloadState]);

  const handleSave = React.useCallback(async () => {
    if (!layerRef.current) {
      console.error('No layer!');
      return;
    }
    if (!data) {
      console.error('No feature data!');
      return;
    }
    const bounds = layerRef.current.getBounds();
    const coords = {
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast()
    };
    console.log('coords', data, coords);
    
    setDownloadState(downloadStates.downloading);
    try {
      await handleDownloadCourse(data, coords);
      setDownloadState(downloadStates.complete);
    } catch (error) {
      setDownloadState(downloadStates.error);
      setDownloadError(`${error.message || error}`);
    }

    // if (onClose) onClose();
    // onClose({
    //   heightScale: parseFloat(tempHeight),
    //   terrainSmoothingRadius: parseFloat(tempSmooth)
    // });
  }, [data]);


  return (
    <Dialog
      fullWidth={true}
      maxWidth="sm"
      onClose={() => onClose()}
      open={open}
    >
      <DialogTitle>
        Download Terrain Data
      </DialogTitle>
      {downloadState === downloadStates.init ? (
        <DialogContent>
          <Stack spacing={5} sx={{ py: 4 }}>
            <TextField
              label="Data Set"
              defaultValue={data?.properties?.name}
              slotProps={{ input: { readOnly: true } }}
            />
            
            <NumberField
              label="Resolution"
              value={resolution}
              min={0.1}
              max={5}
              step={0.1}
              onChange={handleResolutionChange}
            />
            <Alert severity="warning">Note: The course size and center point cannot be changed once lidar is processed.</Alert>
          </Stack>
        </DialogContent>
      ) : null}
      
      {downloadState === downloadStates.downloading ? (
        <DialogContent>
          <Stack spacing={3} sx={{ justifyItems: 'center', alignItems: 'center' }}>
            <CircularProgress />
            <Typography color="textSecondary">Downloading and processing lidar...</Typography>
          </Stack>
        </DialogContent>
      ) : null}
      
      {downloadState === downloadStates.complete ? (
        <DialogContent sx={{ justifyContent: 'center' }}>
          <Stack spacing={3} sx={{ justifyItems: 'center', alignItems: 'center' }}>
            <Box>
              <CheckIcon color="success" sx={{ fontSize: 48 }} />
            </Box>
            <Typography color="textSecondary">Lidar processing completed</Typography>

          </Stack>
        </DialogContent>
      ) : null}

      {downloadState === downloadStates.error ? (
        <DialogContent sx={{ justifyContent: 'center' }}>
          <Alert severity="error">{downloadError}</Alert>
        </DialogContent>
      ) : null}

      
      <DialogActions>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleCancel}
          >
            {downloadState === downloadStates.complete ? 'Done' : 'Cancel'}
          </Button>

          <Button
            variant="contained"
            color="primary"
            onClick={handleSave}
            disabled={downloadState !== downloadStates.init}
          >
            Download Lidar
          </Button>
      </DialogActions>
    </Dialog>
  );
 
}