import { Button, CircularProgress } from '@mui/material';
import React from 'react';

export default function LoadingButton({ pending, disabled, children, ...props }) {
  return (
    <Button fullWidth={true} {...props} disabled={disabled || pending}>{pending ? <CircularProgress size={18} /> : children}</Button>
  )
}