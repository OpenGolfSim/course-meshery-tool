import React, { useEffect, useMemo, useState } from 'react';
import CheckCircle from '@mui/icons-material/CheckCircle';
import { Alert, Box, Button, Card, CardActionArea, CardActions, CardContent, CardHeader, Container, Grid, LinearProgress, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Paper, Stack, Typography } from '@mui/material';
import { useInstaller } from '../contexts/Installer';

function InstallStart({ state }) {
  const handleInstallStart = async () => {
    window.meshery.tools.installStart();
  }

  const handleExit = () => {
    window.meshery.app.exit();
  }

  return (
    <React.Fragment>
      <CardContent>
        <Typography sx={{ mb: 2 }}>Welcome to OpenGolfSim Course Meshery! This software requires a few additional tools to run, including PDAL, GDAL, and other geospatial processing libraries. Click Install Tools and we'll set everything up for you. </Typography>
        <Alert severity="info">These extra tools require about {state.requiredSpace} of free disk space and may take a few moments to install</Alert>
      </CardContent>
      <CardActions>
        <Button onClick={handleExit} fullWidth variant="contained" color="secondary">Exit</Button>
        <Button onClick={handleInstallStart} fullWidth variant="contained">Install Tools</Button>
      </CardActions>
    </React.Fragment>
  );
}

function InstallProgress({ state }) {
  const cancelInstall = () => {
    window.meshery.tools.installCancel();
  }
  return (
    <React.Fragment>
      <CardContent>
        <LinearProgress
          sx={{ mb: 2 }}
          value={state.progress > -1 ? state.progress : null}
          variant={state.progress > -1 ? 'determinate' : 'indeterminate'}
        />
        <Typography>{state.status}</Typography>
      </CardContent>
      <CardActions>
        <Button fullWidth onClick={cancelInstall} variant="contained" color="secondary">Cancel</Button>
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
          <Box sx={{ textAlign: 'center' }}>
            <CheckCircle sx={{ fontSize: 48 }} />
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