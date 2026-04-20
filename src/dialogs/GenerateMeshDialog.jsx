import React, { useCallback, useEffect, useMemo } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Dialog,
  DialogTitle,
  DialogContent,
  Typography,
  DialogActions,
  Button,
  Alert,
  Stack,
  Box,
  Grid,
  Avatar,
  Chip,
  CircularProgress
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import GradientIcon from '@mui/icons-material/Gradient';
import TriangleIcon from '@mui/icons-material/DeviceHub';
import CheckIcon from '@mui/icons-material/CheckCircle';

import MenuBookIcon from '@mui/icons-material/MenuBook';
import ClearIcon from '@mui/icons-material/Clear';
import { useMeshery } from '../contexts/Meshery.jsx';
import SurfaceSettings from '../components/SurfaceSettings.jsx';
import { useProject } from '../contexts/Project.jsx';
import { defaultSettings } from '../lib/settings.js';

export default function GenerateMeshDialog(props) {
  const { project, palette } = useProject();
  // const { settings, layerSettings, layers, setLayerSettings } = useMeshery();
  const { onClose, open } = props;
  const [expanded, setExpanded] = React.useState(false);
  const [layerSettings, setLayerSettings] = React.useState({ ...defaultSettings });
  const [jobState, setJobState] = React.useState({ phase: 'settings', count: 0, progress: 0 });

  const handleChange = (panel) => (event, isExpanded) => {
    setExpanded(isExpanded ? panel : false);
  };

  const settingGroups = useMemo(() => {
    if (!layerSettings) {
      return [];
    }
    return Object.entries(layerSettings).reduce((prev, [key, val]) => {
      const count = project._layers?.filter(layer => (layer.surface === key))?.length || 0;
      return [
        ...prev,
        {
          surface: key,
          count,
          ...val
        }
      ]
    }, []);
  }, [layerSettings, project._layers]);

  const getKeyByValue = (object, value) => {
    return Object.keys(object).find(key => object[key] === value);
  }
  const handleClose = () => {
    onClose();
  };
  
  const handleBlendChange = React.useCallback((setting, key, value) => {
    setLayerSettings(old => ({
      ...old,
      [setting.surface]: {
        ...old[setting.surface],
        // blend: value,
        blending: {
          ...old[setting.surface].blending || {},
          [key]: value          
        }
      }
    }));
  }, [layerSettings]);
  
  const handleBlendToggle = React.useCallback((setting, checked) => {
    console.log('TOGGLE', setting, checked);
    setLayerSettings(old => ({
      ...old,
      [setting.surface]: {
        ...old[setting.surface],
        blending: {
          ...old[setting.surface].blending || {},
          enabled: checked
        }
      }
    }));
  }, [layerSettings]);
  
  const handleDigToggle = React.useCallback((setting, checked) => {
    console.log('TOGGLE', setting, checked);
    setLayerSettings(old => ({
      ...old,
      [setting.surface]: {
        ...old[setting.surface],
        dig: {
          ...old[setting.surface].dig || {},
          enabled: checked
        }
      }
    }));
  }, [layerSettings]);
  
  const handleDigChange = React.useCallback((setting, key, value) => {
    console.log('handleDigChange', setting, key, value);
    setLayerSettings(old => ({
      ...old,
      [setting.surface]: {
        ...old[setting.surface],
        dig: {
          ...old[setting.surface].dig || {},
          [key]: value
        }
      }
    }));
  }, [layerSettings]);

  const handleSpacingChange = React.useCallback((setting, value) => {
    setLayerSettings(old => ({
      ...old,
      [setting.surface]: {
        ...old[setting.surface],
        spacing: value
      }
    }));

  }, [layerSettings]);
  
  const handleSpacingEdgeChange = React.useCallback((setting, value) => {
    setLayerSettings(old => ({
      ...old,
      [setting.surface]: {
        ...old[setting.surface],
        // spacingEdge: value
        blending: {
          ...old[setting.surface].blending || {},
          spacing: value
        }        
      }
    }));

  }, [layerSettings]);

  const handleSaveChanges = (setting, changes) => {
    console.log('setting, changes', setting, changes);
    setLayerSettings(old => ({
      ...old,
      [setting.surface]: {
        ...old[setting.surface],
        // spacingEdge: value
        ...changes
      }
    }));
  }

  const handleConfirm = useCallback(async () => {
    console.log('generate them!');
    setJobState(old => ({ ...old, phase: 'generate' }));
    await window.meshery.project.generateMeshes(layerSettings);
    console.log('Done generating meshes!');
    setJobState(old => ({ ...old, phase: 'complete' }));
    // onClose(true);
  }, [layerSettings]);

  const handleProgressUpdate = useCallback(async (evt, update) => {
    // console.log('update progress', update);
    setJobState(old => ({ ...old, ...update }));
  }, []);

  useEffect(() => {
    window.meshery.on('mesh.progress', handleProgressUpdate);
    return () => {
      window.meshery.off('mesh.progress', handleProgressUpdate);
    }
  }, []);

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
        Generate Meshes
      </DialogTitle>
  

      <DialogContent>

        {jobState.phase === 'settings' ? (
          <React.Fragment>
            <Alert sx={{ mb: 5 }}>Detected {project._layers?.length || 0} layers</Alert>

            <Typography sx={{ mb: 3 }} variant="h3">Global Settings</Typography>
            {settingGroups.map(setting => (
              <Accordion key={setting.surface} expanded={expanded === setting.surface} onChange={handleChange(setting.surface)}>
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  aria-controls="panel1bh-content"
                  id="panel1bh-header"
                >
                  <Box sx={{ width: '33%', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    <Avatar
                      sx={{
                        backgroundColor: `#${getKeyByValue(palette, setting.surface) || 'aaa'}`,
                        width: 15,
                        height: 15,
                        mr: 2
                      }}
                    >{' '}</Avatar>
                    <Typography component="span">
                      {setting.surface}
                      ({setting.count})
                    </Typography>
                  </Box>
                  <Typography component="span" sx={{ color: 'text.secondary', display: 'flex', gap: 2 }}>
                    
                    <Chip
                      size="small"
                      avatar={<TriangleIcon />}
                      // label={`${setting.dig?.depth}m:${setting.dig?.distance}m`}
                      label={`${setting.spacing.toFixed(2)}m`}
                    />
                    
                    {setting.blending.enabled ? (
                      <Chip
                        size="small"
                        avatar={<GradientIcon />}
                        label={`${setting.blending?.distance?.toFixed(2)}m:${setting.blending?.spacing?.toFixed(2)}m`}
                      />
                    ) : null}

                    {setting.dig.enabled ? (
                      <Chip
                        size="small"
                        avatar={<ArrowDownwardIcon />}
                        label={`${setting.dig?.depth?.toFixed(2)}m:${setting.dig?.distance?.toFixed(2)}m`}
                      />
                    ) : null}

                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <SurfaceSettings
                    surface={setting.surface}
                    spacing={setting.spacing}
                    // blending={setting.blending}
                    dig={setting.dig}
                    onChange={(changes) => handleSaveChanges(setting, changes)}
                    // onSpacingChange={(value) => handleSpacingChange(setting, value)}
                    // onBlendChange={(key, value) => handleBlendChange(setting, key, value)}
                    // onBlendToggle={(value) => handleBlendToggle(setting, value)}
                    // onDigToggle={(value) => handleDigToggle(setting, value)}
                    // onDigChanged={(key, value) => handleDigChange(setting, key, value)}
                  />
                </AccordionDetails>
              </Accordion>
            ))}

          </React.Fragment>
        ) : null}        
      
      
        {jobState.phase === 'generate' ? (
          <Stack spacing={3} sx={{ justifyItems: 'center', alignItems: 'center' }}>
            <CircularProgress variant="determinate" value={jobState.progress} />
            {jobState.status ? (
              <Typography>{jobState.status}</Typography>
            ) : (
              <Typography>Generating {jobState.count} of {project._layers?.length || 0} meshes...</Typography>
            )}
          </Stack>
        ) : null}
        
        {jobState.phase === 'complete' ? (
          <Stack spacing={3} sx={{ justifyItems: 'center', alignItems: 'center' }}>
            <Box>
              <CheckIcon color="success" sx={{ fontSize: 48 }} />
            </Box>
            <Typography color="textSecondary">Meshes have been generated</Typography>
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
        >Generate Meshes</Button>
      </DialogActions>
    </Dialog>
  );
 
}