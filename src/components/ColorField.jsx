import React, { useEffect, useRef, useState } from 'react';
import { Avatar, Box, InputAdornment, TextField } from '@mui/material';

export default function ColorField({ label, value, onChange }) {
  const colorInput = useRef();
  const debounceTimer = useRef();
  // const [hex, setHex] = useState(value);

  const handleChange = (e) => {
    const value = e.target.value;
    // Regex: Only allow 0-9, a-f, A-F
    if (value === '' || /^[0-9A-Fa-f\b]+$/.test(value)) {
      // setHex(value);
      if (colorInput.current) {
        colorInput.current.value = `#${value}`;
      }
    }
  };

  const handleColorChange = (event) => {
    const newHex = event.target.value;
    // console.log('color change', newHex);
    // setHex(event.target.value);
    clearTimeout(debounceTimer.current);
    if (onChange) {
      debounceTimer.current = setTimeout(() => onChange(newHex), 100);
    }
  }

  const handleFocus = () => {
    colorInput.current.click();
  }

  return (
    <Box sx={{ position: 'relative' }}>
      <TextField
        size="small"
        label={label}
        fullWidth
        value={value}
        onFocus={handleFocus}
        onChange={handleChange}
        slotProps={ {
          htmlInput: { maxLength: 6 },
          input: {
            sx: theme => ({ fontFamily: 'monospace', color: theme.palette.text.secondary }),
            startAdornment: (
              <InputAdornment position="start">
                <span style={{ display: 'inline-block', width: 17, height: 17, borderRadius: '50%', backgroundColor: value }}></span>
              </InputAdornment>
            ),
          }
        }}
      />
      <input
        ref={colorInput}
        type="color"
        value={value}
        onChange={handleColorChange}
        style={{ visibility: 'hidden', position: 'absolute', left: 0, top: 10 }}
      />
    </Box>
  )
}

  