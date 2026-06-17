import React from 'react';
import { Dialog, DialogTitle, DialogContent, Typography, DialogActions, Button, Alert, Stack, Box, TextField, MenuItem } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ClearIcon from '@mui/icons-material/Clear';

export default function GenerateTerrainDialog(props) {
  const { onClose, open } = props;

  const handleClose = () => {
    onClose();
  };
  const handleGenerate = async () => {
    await window.meshery.terrain.generate('flat');
    onClose();
  };

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
            fullWidth={true}
            defaultValue={'flat'}
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