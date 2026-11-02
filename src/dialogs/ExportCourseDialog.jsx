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
  MenuItem,
  Grid
} from '@mui/material';
import CheckIcon from '@mui/icons-material/CheckCircle';
import { useProject } from '../contexts/Project.jsx';

function ExportCourseDialogContent(props) {
  const {
    jobState,
    mapImage,
    exportProgress,
    exportSettings,
    setExportSettings
  } = props;

  const handleTitleChange = (event) => {
    setExportSettings(old => ({ ...old, title: event.target.value }));
  }
  return (
    <DialogContent>
      
      {jobState.phase === 'prepare' ? (
        <Stack spacing={3} sx={{ justifyItems: 'center', alignItems: 'center' }}>
          <CircularProgress variant="indeterminate" />
          <Typography>Preparing for export...</Typography>
        </Stack>
      ) : null}

      {jobState.phase === 'settings' ? (
        <Grid container={true} spacing={3}>
          <Grid sx={{ width: 200 }}>
            {mapImage ? (
              <img src={mapImage} width={200} />
            ) : null}
            {/* {data.lightMapImage ? (
              <img src={data.lightMapImage} width={200} />
            ) : null} */}
          </Grid>
          <Grid flex={1}>
            <Stack spacing={3} sx={{ py: 2 }}>
              <TextField
                fullWidth={true}
                label="Course Title"
                value={exportSettings.title}
                onChange={handleTitleChange}
              />
            </Stack>
          </Grid>
          
        </Grid>
      ) : null}        
    
    
      {jobState.phase === 'generate' ? (
        <Stack spacing={3} sx={{ justifyItems: 'center', alignItems: 'center' }}>
          <CircularProgress variant={exportProgress.percent >= 0 ? 'determinate' : 'indeterminate'} value={exportProgress.percent} />
          <Typography>{exportProgress.status || 'Exporting...'}</Typography>
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
  )
}
export default function ExportCourseDialog(props) {
  const { project, palette } = useProject();
  const { onClose, state, data } = props;
  const open = Boolean(state);

  const [jobState, setJobState] = useState({ phase: 'prepare', count: 0, progress: 0 });
  const [exportProgress, setExportProgress] = useState({ status: 'Initializing...', percent: -1 });
  const [exportSettings, setExportSettings] = useState({ title: '', format: 'glb' });

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
  const handleProgressUpdate = useCallback(async (evt, update) => {
    console.log('update progress', update);
    setExportProgress(update);
    // setJobState(old => ({ ...old, ...update }));
  }, []);

  useEffect(() => {
    window.meshery.on('export.progress', handleProgressUpdate);
    return () => {
      window.meshery.off('export.progress', handleProgressUpdate);
    }
  }, []);

  useEffect(() => {
    if (!state) {
      // const phase = state === 'ready' ? 'settings' : 'prepare';
      // console.log(`effect open: ${open}, state: ${state}, phase: ${phase}`);
      setJobState({ phase: 'prepare', count: 0, progress: 0 });
    } else {
      setJobState(old => ({ ...old, phase: state === 'ready' ? 'settings' : 'prepare' }));
    }
  }, [state]);
  
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
  

      <ExportCourseDialogContent
        mapImage={data.mapImage}
        jobState={jobState}
        exportProgress={exportProgress}
        exportSettings={exportSettings}
        setExportSettings={setExportSettings}
      />

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