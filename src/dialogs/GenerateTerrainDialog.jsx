import React, { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, Typography, DialogActions, Button, Alert, Stack, Box, TextField, MenuItem, CircularProgress } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ClearIcon from '@mui/icons-material/Clear';
import { useProject } from '../contexts/Project';

export default function GenerateTerrainDialog(props) {
  const { onClose, open } = props;
  const { generateTerrainData } = useProject();
  const [terrainType, setTerrainType] = useState('flat');
  const [isPending, setIsPending] = useState(false);

  const handleClose = () => {
    onClose();
  };
  const handleGenerate = useCallback(async () => {
    // await window.meshery.terrain.generate(terrainType);
    setIsPending(true);
    await generateTerrainData(terrainType);
    onClose();
  }, [terrainType]);

  useEffect(() => {
    if (open) {
      setIsPending(false);
    }
  }, [open]);

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
        {isPending ? (
          <Box sx={{ pt: 3, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
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
        )}
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