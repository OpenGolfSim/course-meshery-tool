import React from 'react';
import { Box, Stack, Typography, Slider, InputBase, Switch, FormControlLabel, Checkbox } from '@mui/material';
import CurveEditDialog from '../dialogs/CurveEditDialog.jsx';
import NumericInput from './NumericInput.jsx';

export default function SurfaceSettings(props) {
  const {
    surface,
    spacing,
    spacingEdge,
    blending,
    dig,
    isDisabled,
    onSpacingChange,
    onBlendChange,
    onBlendToggle,
    onDigChanged,
    onDigDepthChange,
    onDigToggle,
    onDigDistanceChange
  } = props;

  const showDig = React.useMemo(() => {
    return ['water','sand','river'].includes(surface);
  }, [surface]);

  const handleInputChange = (callback) => {
    return (event) => {
      callback(event.target.value);
    }
  }
  // const handleInputToggle = (callback) => {
  //   return (event) => {
  //     callback(event.target.checked);
  //   }
  // }
  return (
    <Box>
      <Stack direction="column" spacing={1} sx={{ px: 2, pb: 2 }}>

        <NumericInput
          label="Base Tri Spacing"
          disabled={isDisabled}
          value={spacing}
          min={0.1}
          max={6}
          step={0.1}
          onChange={onSpacingChange}
        />

        <NumericInput
          label="Blend Distance"
          hasCheckbox={true}
          checked={blending?.enabled}
          disabled={isDisabled || !blending?.enabled}
          value={blending?.distance}
          min={0.05}
          max={5}
          step={0.05}
          onToggled={onBlendToggle}
          onChange={(value) => onBlendChange('distance', value)}
        />
        <NumericInput
          label="Blend Tri Spacing"
          disabled={isDisabled || !blending?.enabled}
          value={blending?.spacing}
          min={0.1}
          max={6}
          step={0.1}
          onChange={(value) => onBlendChange('spacing', value)}
        />

        {showDig ? (
          <>
            <NumericInput
              label="Dig Depth"
              hasCheckbox={true}
              checked={dig?.enabled}
              disabled={isDisabled || !dig?.enabled}
              value={dig?.depth}
              min={0.05}
              max={3}
              step={0.05}
              onToggled={onDigToggle}
              onChange={(value) => onDigChanged('depth', value)}
              // onChange={onDigDepthChange}
            />
            <NumericInput
              label="Dig Distance"
              disabled={isDisabled || !dig?.enabled}
              value={dig?.distance}
              min={0.05}
              max={5}
              step={0.05}
              onChange={(value) => onDigChanged('distance', value)}
            />
          </>
        ) : null}

        {/* {dig ? (
          <>
            <Typography sx={{ m: 0 }} variant="h6">Dig Depth</Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              <InputBase value={digDepth} sx={{ width: 70 }} type="number" />
              <Slider
                size="small"
                value={digDepth}
                disabled={isDisabled}
                min={0.01}
                max={10}
                step={0.01}
                onChange={onDigDepthChange}
              />
            </Stack>
            <Typography sx={{ m: 0 }} variant="h6">Dig Distance</Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              <InputBase value={digDistance} sx={{ width: 70 }} type="number" />
              <Slider
                size="small"
                value={digDistance}
                disabled={isDisabled}
                min={0.05}
                max={1}
                step={0.01}
                onChange={onDigDistanceChange}
              />
            </Stack>
            
            <Typography sx={{ m: 0 }} variant="h6">Dig Curve</Typography>
            <Stack direction="row">
              <TextField select={true} value={layer.dig.curve} onChange={handleDigCurveChange} fullWidth={true} size="small">
                <MenuItem value="smooth">Smoothstep</MenuItem>
                <MenuItem value="linear">Linear</MenuItem>
                <MenuItem value="sine">Sine</MenuItem>
                <MenuItem value="bezier">Bezier</MenuItem>
              </TextField>
              <CurveEditDialog layer={layer} open={curveEditorOpen} onClose={handleCurvePointsSaved} />


              <IconButton
                disabled={layer.dig.curve !== 'bezier'}
                onClick={() => setCurveEditorOpen(true)}
              >
                <RouteIcon />
              </IconButton>
            </Stack>

          </>
        ) : null} */}
      </Stack>      
    </Box>
  )
}