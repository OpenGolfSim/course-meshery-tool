import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, Typography, CircularProgress } from '@mui/material';

export default function LoadingDialog(props) {
  const { onClose, open, label } = props;
  const [labelCache, setLabelCache] = useState('');
  const handleClose = (event, reason) => {
    // if (reason === 'backdropClick') {
      event.preventDefault();
    // }
    // onClose();
  };

  useEffect(() => {
    if (label){
      setLabelCache(label);
    }
  }, [label]);

  return (
    <Dialog
      onClose={handleClose}
      open={open}
      color="error"
      // maxWidth="xs"
      // fullWidth={true}
      slotProps={{ paper: { elevation: 1 } }}
      // sx={theme => ({ borderWidth: 1, borderColor: theme.palette.error.dark })}
    >
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: 200 }}>
        <CircularProgress size={50} />
        <Typography sx={{ mt: 5 }}>{labelCache || 'Loading...'}</Typography>
      </DialogContent>
    </Dialog>
  );
 
}