import React from 'react';
import { Box, Stack, Typography, Slider, InputBase, Switch, FormControlLabel, Checkbox, TextField, MenuItem, IconButton } from '@mui/material';
import CurveEditDialog from '../dialogs/CurveEditDialog.jsx';
import NumericInput from './NumericInput.jsx';
import RouteIcon from '@mui/icons-material/Route';

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
    onDigToggle
  } = props;
  const [curveEditorOpen, setCurveEditorOpen] = React.useState(false);

  const showDig = React.useMemo(() => {
    return ['water','sand','river'].includes(surface);
  }, [surface]);

  const handleCurveEditClose = (points) => {
    onDigChanged('curvePoints', points);
    setCurveEditorOpen(false);
  }

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
              max={8}
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

            <Typography sx={{ m: 0 }} variant="h6">Dig Curve</Typography>
            <Stack direction="row">
              <TextField
                select={true}
                value={dig.curve}
                onChange={(e) => onDigChanged('curve', e.target.value)}
                fullWidth={true}
                size="small"
              >
                <MenuItem value="smooth">Smoothstep</MenuItem>
                <MenuItem value="linear">Linear</MenuItem>
                <MenuItem value="sine">Sine</MenuItem>
                <MenuItem value="bezier">Bezier</MenuItem>
              </TextField>


              <IconButton
                disabled={dig.curve !== 'bezier'}
                onClick={() => setCurveEditorOpen(true)}
              >
                <RouteIcon />
              </IconButton>
            </Stack>
            <CurveEditDialog
              dig={dig}
              open={curveEditorOpen}
              onClose={handleCurveEditClose}
            />

          </>
        ) : null}

      </Stack>      
    </Box>
  )
}