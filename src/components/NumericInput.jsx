import React from 'react';
import { Box, Stack, Typography, Slider, InputBase, Switch, FormControlLabel, Checkbox } from '@mui/material';

export default function NumericInput(props) {
  const {
    label,
    value,
    onChange,
    onToggled,
    max,
    min,
    step,
    hasCheckbox,
    checked,
    disabled
  } = props;
  const timer = React.useRef();
  const [tempValue, setTempValue] = React.useState(value);
  
  const handleCheckChange = (event) => {
    // console.log('handleCheckChange', event.target.checked);
    onToggled(event.target.checked);
  }

  const handleInputChange = (event) => {
    // console.log('handleInputChange', event.target.value);
    let num = event.target.value;
    if (max) {
      num = Math.min(num, max);
    }
    if (min) {
      num = Math.max(num, min);
    }
    setTempValue(num);
  }

  const handleTriggerUpdate = React.useCallback(() => {
    console.log('send update', tempValue);
    onChange(tempValue);
  }, [tempValue]);

  React.useEffect(() => {
    if (value !== tempValue) {
      clearTimeout(timer.current);
      timer.current = setTimeout(handleTriggerUpdate, 500);
    }
  }, [tempValue]);
  
  React.useEffect(() => {
    if (value !== tempValue) {
      console.log('input value changed', value);
    }
  }, [value]);

  return (
    <Box>
      <Typography color="textSecondary" sx={{ m: 0, mb: 2 }} variant="h6">{label}</Typography>

      <Stack direction="row" alignItems="center" spacing={2}>
        <Box sx={{ width: 70 }}>
          {hasCheckbox ? (
            <Checkbox checked={checked} size="small" onChange={handleCheckChange} />
          ) : null}
        </Box>
        <InputBase
          slotProps={{ input: { min, max, step } }}
          value={tempValue}
          disabled={disabled}
          onChange={handleInputChange}
          sx={theme => ({ width: 80, paddingRight: 1, paddingLeft: 2, backgroundColor: theme.palette.grey[800] })}
          type="number"
        />
        <Slider
          size="small"
          disabled={disabled}
          value={tempValue}
          min={min}
          max={max}
          step={step}
          onChange={handleInputChange}
        />
      </Stack>
    </Box>
  )
}