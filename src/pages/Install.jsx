import React, { useEffect, useMemo, useState } from 'react';
import CheckCircle from '@mui/icons-material/CheckCircle';
import { Alert, Box, Button, Card, CardActionArea, CardActions, CardContent, CardHeader, Container, Grid, LinearProgress, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Paper, Stack, Typography } from '@mui/material';
import { useInstaller } from '../contexts/Installer';

function InstallStart() {
  const handleInstallStart = async () => {
    window.meshery.tools.installStart();
  }

  const handleExit = () => {

  }

  return (
    <React.Fragment>
      <CardContent>
        <Alert severity="warning">We need to install some required tools for elevation data and image processing.</Alert>
      </CardContent>
      <CardActions>
        <Button onClick={handleExit} fullWidth variant="contained" color="secondary">Exit</Button>
        <Button onClick={handleInstallStart} fullWidth variant="contained">Install Tools</Button>
      </CardActions>
    </React.Fragment>
  );
}

function InstallProgress({ state }) {
  return (
    <React.Fragment>
      <CardContent>
        <LinearProgress value={state.progress} variant="determinate" />
        <Typography>{state.status}</Typography>
      </CardContent>
      <CardActions>
        <Button fullWidth variant="contained" color="secondary">Cancel</Button>
      </CardActions>
    </React.Fragment>
  );
}

function InstallComplete({ state }) {
  return (
    <React.Fragment>
      <CardContent>
        {state.error ? (
          <Alert severity="error">{state.error}</Alert>
        ) : (
          <Box>
            <CheckCircle />
            <Typography>{state.status}</Typography>
          </Box>
        )}
      </CardContent>
      <CardActions>
        <Button onClick={() => window.location.reload()} fullWidth variant="contained">Done</Button>
      </CardActions>
    </React.Fragment>
  );
}

export default function Install() {
  const { installState } = useInstaller();

  const children = useMemo(() => {
    if (installState.finished) {
      return <InstallComplete state={installState} />;
    }
    if (installState.active) {
      return <InstallProgress state={installState} />;
    }
    return <InstallStart state={installState} />;
  }, [installState]);

  return (
    <Container sx={{ p: 5 }} maxWidth="sm">
      <Card>
        <CardHeader title="Install Required Tools" />
        {children}
      </Card>
    </Container>
  )
}