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


export default function LayerListItem({
  layer,
  selectedLayer,
  onExpand,
  onZoom,
  onCurveEdit,
}) {
  const { updateLayerById } = useMeshery();
  const [spacing, setSpacing] = useState(layer.spacing);
  const [digDepth, setDigDepth] = useState(layer.dig?.depth || 0);
  const [digDistance, setDigDistance] = useState(layer.dig?.distance || 0);
  const [digCurve, setDigCurve] = useState(layer.dig?.curve || 0);
  const [curveEditorOpen, setCurveEditorOpen] = useState(false);
  
  const expanded = useMemo(() => {
    return selectedLayer === layer.id;
  }, [selectedLayer, layer.id]);
  // const { updateLayerById } = useMeshery();

  const timer = useRef();
  
  const handleTriggerUpdate = React.useCallback((e) => {
      updateLayerById(layer.id, {
        spacing,
        dig: {
          ...layer.dig,
          depth: digDepth,
          curve: digCurve,
          distance: digDistance
        }
      });
  }, [layer, spacing, digDepth, digDistance, digCurve]);

  const handleSpacingChange = React.useCallback((e) => {
    const value = e.target.value;
    setSpacing(value);
  }, [spacing]);
  
  
  const handleDigDistanceChange = React.useCallback((e) => {
    const value = e.target.value;
    setDigDistance(value);
  }, []);

  const handleDigDepthChange = React.useCallback((e) => {
    const value = e.target.value;
    setDigDepth(value);
  }, []);
  
  const handleDigCurveChange = React.useCallback((e) => {
    const value = e.target.value;
    setDigCurve(value);
  }, []);

  const handleClick = useCallback(() => {
    onExpand(layer.id, !expanded);
  }, [expanded]);


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


  useEffect(() => {
    if (
      spacing !== layer.spacing || 
      layer.dig?.depth && digDepth !== layer.dig?.depth ||
      layer.dig?.distance && digDistance !== layer.dig?.distance ||
      layer.dig?.curve && digDepth !== layer.dig?.curve
    ) {
      clearTimeout(timer.current);
      timer.current = setTimeout(handleTriggerUpdate, 500);
    }
  }, [spacing, digDepth, digDistance, digCurve]);

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
        <Collapse in={expanded} sx={theme => ({ backgroundColor: theme.palette.background.paper })}>
          <Box sx={{ p: 1 }}>
            <Tooltip title="Zoom to Layer">
              <IconButton size="small" onClick={() => onZoom(layer)}><ZoomInIcon /></IconButton>
            </Tooltip>
            <Tooltip title="Set Layer Visibility">
              <IconButton size="small" onClick={handleVisibilityToggle}>
                {layer.visible ? (
                  <VisibilityIcon />
                ) : (
                  <VisibilityOffIcon />
                )}
              </IconButton>
            </Tooltip>
          </Box>
          {layer.error ? (
            <Box>{layer.error}</Box>
          ) : (

            <Stack direction="column" spacing={1} sx={{ px: 2, pb: 2 }}>
              <Typography sx={{ m: 0 }} variant="h6">Triangle Spacing</Typography>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="body2">{(spacing || 0).toFixed(2)}</Typography>
                <Slider
                  size="small"
                  disabled={isDisabled}
                  value={spacing}
                  min={0.2}
                  max={5}
                  step={0.05}
                  onChange={handleSpacingChange}
                />
              </Stack>
              {layer.dig?.depth ? (
                <>
                  <Typography sx={{ m: 0 }} variant="h6">Dig Depth</Typography>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="body2">{digDepth}</Typography>
                    <Slider
                      size="small"
                      value={digDepth}
                      disabled={isDisabled}
                      min={0.01}
                      max={10}
                      step={0.01}
                      onChange={handleDigDepthChange}
                    />
                  </Stack>
                  <Typography sx={{ m: 0 }} variant="h6">Dig Distance</Typography>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="body2">{digDistance}</Typography>
                    <Slider
                      size="small"
                      value={digDistance}
                      disabled={isDisabled}
                      min={0.05}
                      max={1}
                      step={0.01}
                      onChange={handleDigDistanceChange}
                    />
                  </Stack>
                  
                  <Typography sx={{ m: 0 }} variant="h6">Dig Curve</Typography>
                  <Stack direction="row">
                    <TextField select={true} value={layer.dig.curve} onChange={handleDigCurveChange} fullWidth={true} size="small">
                      <MenuItem value="smooth">Smoothstep</MenuItem>
                      <MenuItem value="linear">Linear</MenuItem>
                      <MenuItem value="sine">Sine</MenuItem>
                      {/* <MenuItem value="pow">Expo</MenuItem> */}
                      <MenuItem value="bezier">Bezier</MenuItem>
                    </TextField>


                    <IconButton
                      disabled={layer.dig.curve !== 'bezier'}
                      onClick={() => setCurveEditorOpen(true)}
                    >
                      <RouteIcon />
                    </IconButton>
                  </Stack>

                </>
              ) : null}
            </Stack>
          )}

        </Collapse>
      </Box>
      <CurveEditDialog layer={layer} open={curveEditorOpen} onClose={handleCurvePointsSaved} />
    </>
  )
}