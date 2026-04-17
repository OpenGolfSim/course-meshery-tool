import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, ListItemText, IconButton, ListItem, ListItemAvatar, Avatar, ListItemButton, Link, Button, ButtonBase, Typography, CircularProgress, Accordion, AccordionDetails, AccordionSummary, Slider, Stack, Tooltip, TextField, MenuItem, Collapse, Chip } from '@mui/material';
import RouteIcon from '@mui/icons-material/Route';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ErrorIcon from '@mui/icons-material/Error';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ChevronRight';
import ExpandLessIcon from '@mui/icons-material/ExpandMore';
import { styled } from '@mui/material/styles';
import { useMeshery } from '../contexts/Meshery.jsx';
import CurveEditDialog from '../dialogs/CurveEditDialog.jsx';
import SurfaceSettings from './SurfaceSettings.jsx';


export default function LayerSettings({
  layer,
  selectedLayer,
  onClick,
  onExpand,
  onZoom,
  onCurveEdit,
}) {
  const { updateLayerById } = useMeshery();
  const [spacing, setSpacing] = useState(layer.spacing);
  const [curveEditorOpen, setCurveEditorOpen] = useState(false);
  
  const expanded = useMemo(() => {
    return selectedLayer === layer.id;
  }, [selectedLayer, layer.id]);

  const handleSpacingChange = React.useCallback((value) => {
    console.log('handleSpacingChange', value);
    updateLayerById(layer.id, { spacing: value });
    // setSpacing(value);
  }, [layer, spacing]);
  
  const handleBlendChange = React.useCallback((key, value) => {
    console.log('handleBlendChange', key, value);
    updateLayerById(layer.id, (oldLayer) => ({
      ...oldLayer,
      blending: {
        ...oldLayer.blending,
        [key]: value,
      }
    }));
  }, [layer]);
  
  const handleDigChange = React.useCallback((key, value) => {
    console.log('handleDigChange', key, value);
    updateLayerById(layer.id, (oldLayer) => ({
      ...oldLayer,
      dig: {
        ...oldLayer.dig,
        [key]: value,
      }
    }));
  }, [layer]);
  
  const handleClick = useCallback((event) => {
    // onExpand(layer.id, !expanded);
    onClick(event, layer);
  }, [layer, expanded]);


  const handleCurvePointsSaved = useCallback((points) => {
    if (points) {
      updateLayerById(layer.id, {
        spacing,
        dig: { ...layer.dig, curvePoints: points }
      });
    }
    setCurveEditorOpen(false);
  }, [layer]);
  
  const handleVisibilityToggle = useCallback(() => {
    updateLayerById(layer.id, {
      visible: !layer.visible
    });
  }, [layer]);


  const isDisabled = useMemo(() => {
    return layer.error || !layer.mesh || layer.pending || !layer.conformed;
  }, [layer]);

  return (
    <>
      <Box>
        <Box sx={{ p: 2, opacity: layer.visible ? 1 : 0.6 }}>
          <ButtonBase
            sx={{
              width: '100%',
              display: 'flex',
              flexDirection: 'row',
              gap: 3,
              textAlign: 'left'
            }}
            onClick={handleClick}
          >
            {layer.error ? (
              <Tooltip title={layer.error}>
                <ErrorIcon color="error" />
              </Tooltip>
            ) : (
                isDisabled ? (
                <CircularProgress size={15} />
              ) : (
                <Avatar sx={{ backgroundColor: `#${layer.color}`, width: 15, height: 15 }}>{' '}</Avatar>
              )
            )}
            <Box sx={{ flex: 1 }}>
              <Typography component="span">{layer.surface}</Typography>{' '}
              <Typography color="textSecondary" component="span">{layer.name}</Typography>
              
            </Box>
            <Box>
              {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </Box>
          </ButtonBase>
        </Box>
      </Box>
    </>
  )
}