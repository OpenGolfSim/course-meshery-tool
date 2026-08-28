import React, { useEffect, useRef, useState } from 'react';
import { Box, ClickAwayListener, InputAdornment, Paper, Popper, TextField } from '@mui/material';
import { HexColorPicker } from 'react-colorful';

export default function ColorField({ label, value, onChange }) {
  const rootRef = useRef();
  const debounceTimer = useRef();
  const [hex, setHex] = useState(String(value || '').replace('#', ''));
  const [open, setOpen] = useState(false);

  // Re-sync when the parent value changes (surface switch, reset, etc.)
  useEffect(() => {
    setHex(String(value || '').replace('#', ''));
  }, [value]);

  const emit = (h) => {
    clearTimeout(debounceTimer.current);
    if (onChange) {
      debounceTimer.current = setTimeout(() => onChange(`#${h}`), 100);
    }
  };

  const handleTextChange = (e) => {
    const v = e.target.value.replace('#', '').slice(0, 6);
    // Only allow 0-9, a-f, A-F
    if (v !== '' && !/^[0-9A-Fa-f]+$/.test(v)) return;
    setHex(v);
    if (v.length === 6) emit(v);
  };

  const handlePickerChange = (newColor) => {
    const v = newColor.replace('#', '');
    setHex(v);
    emit(v);
  };

  const handleClickAway = (event) => {
    // Clicks on the field/swatch shouldn't close the picker
    if (rootRef.current?.contains(event.target)) return;
    setOpen(false);
  };

  const displayColor = hex.length === 6 ? `#${hex}` : 'transparent';

  return (
    <Box ref={rootRef} sx={{ position: 'relative' }}>
      <TextField
        size="small"
        label={label}
        fullWidth
        value={hex}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        onChange={handleTextChange}
        slotProps={ {
          htmlInput: { maxLength: 7 },
          input: {
            sx: theme => ({ fontFamily: 'monospace', color: theme.palette.text.secondary }),
            startAdornment: (
              <InputAdornment position="start">
                <span
                  onClick={() => setOpen((o) => !o)}
                  style={{ display: 'inline-block', width: 17, height: 17, borderRadius: '50%', backgroundColor: displayColor, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.3)' }}
                ></span>
              </InputAdornment>
            ),
          }
        }}
      />
      <Popper open={open} anchorEl={rootRef.current} placement="bottom-start" sx={{ zIndex: (t) => t.zIndex.modal }}>
        <ClickAwayListener onClickAway={handleClickAway}>
          <Paper elevation={6} sx={{ p: 1, mt: 0.5 }}>
            <HexColorPicker
              color={hex.length === 6 ? `#${hex}` : '#000000'}
              onChange={handlePickerChange}
              style={{ width: 180, height: 160 }}
            />
          </Paper>
        </ClickAwayListener>
      </Popper>
    </Box>
  );
}