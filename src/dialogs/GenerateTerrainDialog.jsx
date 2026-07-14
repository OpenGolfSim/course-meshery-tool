import React, { useCallback, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, Typography, DialogActions, Button, Alert, Stack, Box, TextField, MenuItem } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ClearIcon from '@mui/icons-material/Clear';
import { useProject } from '../contexts/Project';

export default function GenerateTerrainDialog(props) {
  const { onClose, open } = props;
  const { generateTerrainData } = useProject();
  const [terrainType, setTerrainType] = useState('flat');

  const handleClose = () => {
    onClose();
  };
  const handleGenerate = useCallback(async () => {
    // await window.meshery.terrain.generate(terrainType);
    await generateTerrainData(terrainType);
    onClose();
  }, [terrainType]);

  return (
    <Dialog
      onClose={handleClose}
      open={open}
      maxWidth="xs"
      fullWidth={true}
    >
      <DialogTitle>
        Generate Terrain
      </DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 3 }}>
          <TextField
            label="Generate"
            select={true}
            onChange={(event) => setTerrainType(event.target.value)}
            fullWidth={true}
            value={terrainType}
          >
            <MenuItem value="flat">Flat</MenuItem>
            <MenuItem value="random">Random</MenuItem>
          </TextField>
        </Box>
      </DialogContent>
      <DialogActions>

          <Button
            fullWidth
            variant="contained"
            color="secondary"
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button
            fullWidth
            variant="contained"
            color="primary"
            onClick={handleGenerate}
          >
            Generate
          </Button>

      </DialogActions>
    </Dialog>
  );
 
}