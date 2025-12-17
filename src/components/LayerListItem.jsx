import React, { useEffect, useRef, useState } from 'react';
import { Box, ListItemText, IconButton, ListItem, ListItemAvatar, Avatar, ListItemButton, Link, Button, ButtonBase, Typography, CircularProgress, Accordion, AccordionDetails, AccordionSummary, Slider, Stack, Tooltip, TextField, MenuItem } from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { styled } from '@mui/material/styles';

const CustomAccordion = styled(Accordion)(({ theme }) => ({
  border: 0,
  boxShadow: 'none',
  '&:not(:last-child)': {
    borderBottom: 0,
  },
  '&:before': { // Styles the line before the first accordion
    display: 'none',
  },
  '.MuiAccordionSummary-content': {
    '&.Mui-expanded': {
      margin: 0
    }
  },
  '.MuiAccordionSummary-root': {
    minHeight: 40,
    '&.Mui-expanded': {
      minHeight: 40
    }
  },
  '.MuiAccordionDetails-root': {
    backgroundColor: theme.palette.grey[800],
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 8,
    paddingRight: 8
  },
  '.MuiAccordion-heading': {
    fontSize: 11,
  },
  '.MuiAccordionSummary-expandIconWrapper': { // Styles the expand icon
    color: theme.palette.secondary.main,
  },
  '&.Mui-expanded': {
    margin: 0,
    backgroundColor: theme.palette.grey[800],
    // minHeight: 'auto'
  }
}));


export default function LayerListItem({ layer, expanded, onExpand, onZoom, onSettingChanged }) {

  const [spacing, setSpacing] = useState(layer.spacing);
  const [digDepth, setDigDepth] = useState(layer.dig?.depth || 0);

  const timer = useRef();
  // const handleMenuClick = (e) => {
  //   e.preventDefault();
  //   e.stopPropagation();
  //   console.log('menu-click');
  // }

  const handleTriggerUpdate = React.useCallback((e) => {
    if (onSettingChanged) {
      console.log('digDepth', digDepth);
      console.log('spacing', spacing);
      onSettingChanged({
        id: layer.id,
        spacing,
        dig: { ...layer.dig, depth: digDepth },
        mesh: false,
      });
    }
  }, [layer, spacing, digDepth]);

  const handleSpacingChange = React.useCallback((e) => {
    const value = e.target.value;
    console.log('set spacing', value);
    // if (onSettingChanged) {
    //   onSettingChanged({ id: layer.id, spacing: value, mesh: false });
    // }
    setSpacing(value);

  }, [spacing]);
  
  const handleDigDepthChange = React.useCallback((e) => {
    const value = e.target.value;
    console.log('change', value);
    setDigDepth(value);
    
    // if (onSettingChanged) {
    //   onSettingChanged({ id: layer.id, dig: { ...layer.dig, depth: value }, mesh: false });
    // }
  }, [layer]);
  
  const handleDigSmoothChange = React.useCallback((e) => {
    const value = e.target.value;
    console.log('change', value);
    if (onSettingChanged) {
      onSettingChanged({ id: layer.id, dig: { ...layer.dig, curve: value }, mesh: false });
    }
  }, [layer]);
  
  const handleDigSmoothExpoChange = React.useCallback((e) => {
    const value = e.target.value;
    console.log('change', value);
    if (onSettingChanged) {
      onSettingChanged({ id: layer.id, dig: { ...layer.dig, curvePower: value }, mesh: false });
    }
  }, [layer]);
  
  useEffect(() => {
    if (
      spacing !== layer.spacing || 
      layer.dig?.depth && digDepth !== layer.dig?.depth
    ) {
      clearTimeout(timer.current);
      timer.current = setTimeout(handleTriggerUpdate, 500);
    }
  }, [spacing, digDepth]);

  return (
      <CustomAccordion
        disabled={!layer.mesh}
        elevation={0}
        expanded={expanded}
        onChange={(event, isExpanded) => onExpand(layer.id, isExpanded)}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          {layer.mesh ? (
            <Avatar sx={{ backgroundColor: `#${layer.color}`, width: 15, height: 15, mr: 1 }}>{' '}</Avatar>
          ) : (
            <CircularProgress sx={{ mr: 1 }} size={15} />
          )}
          <span>{layer.id}</span>
        </AccordionSummary>
        <AccordionDetails>
          <Box>
            <Tooltip title="Zoom to Layer">
              <IconButton size="small" onClick={() => onZoom(layer)}><ZoomInIcon /></IconButton>
            </Tooltip>
          </Box>
          
          <Stack direction="column" spacing={1}>
            {/* <Typography sx={{ m: 0 }} variant="h6">{layer.zoom ? 'ZOOM' : 'NO'}</Typography> */}
            <Typography sx={{ m: 0 }} variant="h6">Triangle Spacing</Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="body2">{spacing.toFixed(2)}</Typography>
              <Slider
                size="small"
                disabled={!layer.mesh}
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
                    disabled={!layer.mesh}
                    min={0.25}
                    max={20}
                    step={0.25}
                    onChange={handleDigDepthChange}
                  />
                </Stack>
                
                <Typography sx={{ m: 0 }} variant="h6">Dig Curve</Typography>
                <TextField select={true} value={layer.dig.curve} onChange={handleDigSmoothChange} fullWidth={true} size="small">
                  <MenuItem value="smooth">Smoothstep</MenuItem>
                  <MenuItem value="linear">Linear</MenuItem>
                  <MenuItem value="sine">Sine</MenuItem>
                  <MenuItem value="pow">Expo</MenuItem>
                </TextField>
                
                <Typography sx={{ m: 0 }} variant="h6">Expo Power</Typography>
                <Slider
                  size="small"
                  value={layer.dig.curvePower}
                  min={1}
                  max={20}
                  step={1}
                  onChange={handleDigSmoothExpoChange}
                />

              </>
            ) : null}
          </Stack> 
        </AccordionDetails>
      </CustomAccordion>
  )
}