import React from 'react';
import { Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, Stack } from '@mui/material';
import { useMeshery } from '../contexts/Meshery.jsx';
import NumericInput from '../components/NumericInput.jsx';


export default function TerrainSettingsDialog(props) {
  const { onClose, open } = props;
  const { settings, setSettings } = useMeshery();
  const [tempHeight, setTempHeight] = React.useState(settings.heightScale);
  const [tempSmooth, setTempSmoothing] = React.useState(settings.terrainSmoothingRadius);
  
  React.useEffect(() => {
    if (open) {
      setTempHeight(settings.heightScale);
      setTempSmoothing(settings.terrainSmoothingRadius);
    }
  }, [open]);

  const handleHeightUpdate = React.useCallback((val) => {
    // const val = e.target.value;
    setTempHeight(val);
  }, [settings]);

  const handleSmoothingUpdate = React.useCallback((val) => {
    // const val = e.target.value;
    setTempSmoothing(val);
  }, [settings]);

  const handleSave = React.useCallback(() => {
    onClose({
      heightScale: parseFloat(tempHeight),
      terrainSmoothingRadius: parseFloat(tempSmooth)
    });
  }, [tempHeight, tempSmooth]);

  return (
    <Dialog
      fullWidth={true}
      maxWidth="sm"
      onClose={() => onClose()}
      open={open}
    >
      <DialogTitle>
        Terrain Settings
      </DialogTitle>
      <DialogContent>
        <Stack spacing={5} sx={{ py: 4 }}>
          <NumericInput
            label="Terrain Height"
            value={tempHeight}
            min={1}
            max={500}
            step={1}
            onChange={handleHeightUpdate}
          />
          <NumericInput
            label="Terrain Smoothing"
            min={0}
            max={100}
            step={1}
            value={tempSmooth}
            onChange={handleSmoothingUpdate}
          />

          {/* <TextField
            fullWidth={true}
            label="Terrain Height (m)"
            type="number"
            value={tempHeight}
            onChange={handleHeightUpdate}
          /> */}
          {/* <TextField
            fullWidth={true}
            label="Terrain Smoothing (m)"
            type="number"
            value={tempSmooth}
            onChange={handleSmoothingUpdate}
          /> */}
        </Stack>
      </DialogContent>
      <DialogActions>
          <Button
            variant="contained"
            color="secondary"
            onClick={() => onClose()}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSave}
          >
            Save
          </Button>
      </DialogActions>
    </Dialog>
  );
 
}