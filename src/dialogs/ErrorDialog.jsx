import React from 'react';
import { Dialog, DialogTitle, DialogContent, Typography, DialogActions, Button, Alert, Stack, Box } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ClearIcon from '@mui/icons-material/Clear';

export default function ErrorDialog(props) {
  const { onClose, selectedValue, open, systemError } = props;

  const handleClose = () => {
    onClose(selectedValue);
  };

  const handleListItemClick = (value) => {
    onClose(value);
  };

  return (
    <Dialog
      onClose={handleClose}
      open={open}
      color="error"
      maxWidth="sm"
      fullWidth={true}
      slotProps={{ paper: { elevation: 0, sx: theme => ({ borderStyle: 'solid', borderWidth: 1, borderColor: theme.palette.error.dark }) }}}
      sx={theme => ({ borderWidth: 1, borderColor: theme.palette.error.dark })}
    >
      <DialogTitle sx={theme => ({ backgroundColor: theme.palette.error.dark })}>
        Error
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ pt: 3 }}>
         {systemError}
        </Typography>
      </DialogContent>
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* <Stack direction="column" spacing={3}> */}
          <Button
            fullWidth
            variant="contained"
            startIcon={<MenuBookIcon />}
            onClick={() => window.meshery.openExternalUrl('https://help.opengolfsim.com/tools')}
          >
            Help Docs
          </Button>

          <Button
            fullWidth
            variant="contained"
            color="secondary"
            startIcon={<ClearIcon />}
            onClick={handleClose}
          >
            Dismiss
          </Button>
        {/* </Stack> */}
      </Box>
      {/* <DialogActions>
      </DialogActions> */}
    </Dialog>
  );
 
}