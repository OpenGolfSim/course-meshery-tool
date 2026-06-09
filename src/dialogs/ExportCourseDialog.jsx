import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Typography,
  DialogActions,
  Button,
  Stack,
  Box,
  CircularProgress,
  TextField,
  MenuItem
} from '@mui/material';
import CheckIcon from '@mui/icons-material/CheckCircle';
import { useProject } from '../contexts/Project.jsx';

export default function ExportCourseDialog(props) {
  const { project, palette } = useProject();
  const { onClose, open, data } = props;
  console.log('data', data);
  const [jobState, setJobState] = useState({ phase: 'settings', count: 0, progress: 0 });
  const [exportSettings, setExportSettings] = useState({ format: 'glb' });

  const handleFormatChange = (event) => {
    setExportSettings(old => ({ ...old, format: event.target.value }));
  }
  const handleConfirm = useCallback(async () => {
    console.log('start', exportSettings);
    
    setJobState(old => ({ ...old, phase: 'generate' }));

    const result = await window.meshery.project.exportMeshes(exportSettings, data);
    console.log('result', result);
    
    setJobState(old => ({ ...old, phase: 'complete' }));
  }, [exportSettings, data]);

  const handleClose = () => {
    if (onClose) onClose();
  }
  // const handleProgressUpdate = useCallback(async (evt, update) => {
  //   console.log('update progress', update);
  //   setJobState(old => ({ ...old, ...update }));
  // }, []);

  // useEffect(() => {
  //   window.meshery.on('export.progress', handleProgressUpdate);
  //   return () => {
  //     window.meshery.off('export.progress', handleProgressUpdate);
  //   }
  // }, []);
  useEffect(() => {
    if (!open) {
      setJobState({ phase: 'settings', count: 0, progress: 0 });
    }
  }, [open]);

  return (
    <Dialog
      onClose={handleClose}
      open={open}
      color="error"
      maxWidth="sm"
      fullWidth={true}
      slotProps={{ paper: { elevation: 1 }}}
    >
      <DialogTitle>
        Export Course Meshes
      </DialogTitle>
  

      <DialogContent>

        {data.mapImage ? (
          <img src={data.mapImage} height={200} />
        ) : null}

        {jobState.phase === 'settings' ? (
          <Stack spacing={3} sx={{ py: 2 }}>
            <TextField
              select={true}
              fullWidth={true}
              label="Format"
              onChange={handleFormatChange}
              value={exportSettings.format}
            >
              <MenuItem value="glb">.GLB (Fuse)</MenuItem>
              {/* <MenuItem value="obj">.OBJ (Unity)</MenuItem> */}
            </TextField>
          </Stack>
        ) : null}        
      
      
        {jobState.phase === 'generate' ? (
          <Stack spacing={3} sx={{ justifyItems: 'center', alignItems: 'center' }}>
            <CircularProgress variant="indeterminate" />
            <Typography>Exporting...</Typography>
          </Stack>
        ) : null}
        
        {jobState.phase === 'complete' ? (
          <Stack spacing={3} sx={{ justifyItems: 'center', alignItems: 'center' }}>
            <Box>
              <CheckIcon color="success" sx={{ fontSize: 48 }} />
            </Box>
            <Typography color="textSecondary">Course has been exported</Typography>
          </Stack>
        ) : null}
      </DialogContent>

      <DialogActions>
        <Button
          onClick={handleClose}
          color="secondary"
          variant="contained"
        >
          {jobState.phase === 'complete' ? 'Done' : 'Cancel'}
        </Button>
        
        <Button
          onClick={handleConfirm}
          color="primary"
          variant="contained"
          disabled={jobState.phase !== 'settings'}
        >
          Export Course
        </Button>
      </DialogActions>
    </Dialog>
  );
 
}