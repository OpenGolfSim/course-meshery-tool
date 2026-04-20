import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Box, Stack, Typography, Slider, InputBase, Switch, FormControlLabel, Checkbox, TextField, MenuItem, IconButton, Button } from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CurveEditDialog from '../dialogs/CurveEditDialog.jsx';
import NumericInput from './NumericInput.jsx';
import RouteIcon from '@mui/icons-material/Route';
import NumberField from './NumberField.jsx';

export default function SurfaceSettings(props) {
  const {
    layer,
    surface,
    spacing,
    dig,
    onSave,
    onZoom,
    onShowHide,
    onChange
  } = props;
  const firstLoad = useRef();
  const [tempPrefs, setTempPrefs] = useState({ spacing, dig });
  const [curveEditorOpen, setCurveEditorOpen] = useState(false);
  const onSpacingChange = (newValue) => {
    setTempPrefs(old => ({ ...old, spacing: newValue }));
  }
  const onDigChange = (key, val) => {
    setTempPrefs(old => ({ ...old, dig: { ...old.dig, [key]: val } }));
  }
  const showDig = useMemo(() => {
    return ['water','sand','river'].includes(surface);
  }, [surface]);

  const handleCurveEditClose = (points) => {
    setTempPrefs(old => ({ ...old, dig: { ...old.dig, curvePoints: points } }));
    // onDigChanged('curvePoints', points);
    setCurveEditorOpen(false);
  }

  const handleSave = useCallback(() => {
    if (onSave) {
      onSave(tempPrefs);
    }
  }, [tempPrefs]);

  useEffect(() => {
    if (!firstLoad.current) {
      firstLoad.current = true;
      return;
    }
    if (tempPrefs && onChange) {
      onChange(tempPrefs);
    }
  }, [tempPrefs]);

  return (
    <Box>
      <Stack direction="column" spacing={3} sx={{ p: 2 }}>
      
      {layer ? (
        <Stack direction="row" alignItems="center">
          <Typography flex={1}>{layer?.name || surface}</Typography>
          <IconButton onClick={onZoom} size="small"><ZoomInIcon /></IconButton>
          <IconButton onClick={onShowHide} size="small">
            {layer.visible ? <VisibilityOffIcon /> : <VisibilityIcon />}
          </IconButton>
        </Stack>
      ) : null}

        <NumberField
          label="Base Tri Spacing"
          // disabled={isDisabled}
          value={tempPrefs.spacing}
          size="small"
          min={0.1}
          max={10}
          step={0.1}
          onChange={onSpacingChange}
        />
        
        {showDig ? (
          <React.Fragment>
            <NumberField
              label="Dig Depth"
              value={tempPrefs.dig.depth}
              size="small"
              min={0.05}
              max={8}
              step={0.05}
              onChange={(newValue) => onDigChange('depth', newValue)}
            />
            <NumberField
              label="Dig Distance"
              value={tempPrefs.dig.distance}
              size="small"
              min={0.1}
              max={6}
              step={0.1}
              onChange={(newValue) => onDigChange('distance', newValue)}
            />
          </React.Fragment>
        ) : null}

        {onSave ? (
          <Button onClick={handleSave}>Save Changes</Button>
        ) : null}
      </Stack>

      <CurveEditDialog
        dig={dig}
        open={curveEditorOpen}
        onClose={handleCurveEditClose}
      />

    </Box>
  )
}

// export function SurfaceSettingsVV(props) {
//   const {
//     surface,
//     spacing,
//     spacingEdge,
//     blending,
//     dig,
//     isDisabled,
//     onSpacingChange,
//     onBlendChange,
//     onBlendToggle,
//     onDigChanged,
//     onDigToggle
//   } = props;
//   const [curveEditorOpen, setCurveEditorOpen] = React.useState(false);

//   const showDig = React.useMemo(() => {
//     return ['water','sand','river'].includes(surface);
//   }, [surface]);

//   const handleCurveEditClose = (points) => {
//     onDigChanged('curvePoints', points);
//     setCurveEditorOpen(false);
//   }

//   return (
//     <Stack direction="column" spacing={1} sx={{ p: 2 }}>
//       {/* <NumberField /> */}
      

//       <NumberField
//         label="Base Tri Spacing"
//         disabled={isDisabled}
//         value={spacing}
//         size="small"
//         min={0.1}
//         max={6}
//         step={0.1}
//         onChange={onSpacingChange}
//       />

      
//       <NumericInput
//         label="Blend Distance"
//         hasCheckbox={true}
//         checked={blending?.enabled}
//         disabled={isDisabled || !blending?.enabled}
//         value={blending?.distance}
//         min={0.05}
//         max={5}
//         step={0.05}
//         onToggled={onBlendToggle}
//         onChange={(value) => onBlendChange('distance', value)}
//       />
//       <NumericInput
//         label="Blend Tri Spacing"
//         disabled={isDisabled || !blending?.enabled}
//         value={blending?.spacing}
//         min={0.1}
//         max={6}
//         step={0.1}
//         onChange={(value) => onBlendChange('spacing', value)}
//       />

//       {showDig ? (
//         <>
//           <NumericInput
//             label="Dig Depth"
//             hasCheckbox={true}
//             checked={dig?.enabled}
//             disabled={isDisabled || !dig?.enabled}
//             value={dig?.depth}
//             min={0.05}
//             max={8}
//             step={0.05}
//             onToggled={onDigToggle}
//             onChange={(value) => onDigChanged('depth', value)}
//             // onChange={onDigDepthChange}
//           />
//           <NumericInput
//             label="Dig Distance"
//             disabled={isDisabled || !dig?.enabled}
//             value={dig?.distance}
//             min={0.05}
//             max={5}
//             step={0.05}
//             onChange={(value) => onDigChanged('distance', value)}
//           />

//           <Typography sx={{ m: 0 }} variant="h6">Dig Curve</Typography>
//           <Stack direction="row">
//             <TextField
//               select={true}
//               value={dig.curve}
//               onChange={(e) => onDigChanged('curve', e.target.value)}
//               fullWidth={true}
//               size="small"
//             >
//               <MenuItem value="smooth">Smoothstep</MenuItem>
//               <MenuItem value="linear">Linear</MenuItem>
//               <MenuItem value="sine">Sine</MenuItem>
//               <MenuItem value="bezier">Bezier</MenuItem>
//             </TextField>


//             <IconButton
//               disabled={dig.curve !== 'bezier'}
//               onClick={() => setCurveEditorOpen(true)}
//             >
//               <RouteIcon />
//             </IconButton>
//           </Stack>
//           <CurveEditDialog
//             dig={dig}
//             open={curveEditorOpen}
//             onClose={handleCurveEditClose}
//           />

//         </>
//       ) : null}

//     </Stack>
//   )
// }