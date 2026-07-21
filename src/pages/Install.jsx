import React, { useEffect, useMemo, useState } from 'react';
import CheckCircle from '@mui/icons-material/CheckCircle';
import { Alert, Box, Button, Card, CardActionArea, CardActions, CardContent, CardHeader, Container, Grid, LinearProgress, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Paper, Stack, TextField, Typography } from '@mui/material';
import { useInstaller } from '../contexts/Installer';

function InstallStart({ state }) {
  const [toolsPath, setToolsPath] = useState('');
  // const [toolsError, setToolsError] = useState('');
  const handleInstallChange = async () => {
    const newPath = await window.meshery.tools.changeToolsPath();
    console.log('created', newPath);
    if (newPath) {
      setToolsPath(newPath);
    }
  }
  const handleInstallStart = async () => {
    window.meshery.tools.installStart();
  }

  const handleExit = () => {
    window.meshery.app.exit();
  }

  useEffect(() => {
    window.meshery.tools.getToolsPath().then((initialPath) => {
      console.log('initialPath', initialPath);
      setToolsPath(initialPath);
    });
  }, []);
  return (
    <React.Fragment>
      <CardContent>
        <Stack spacing={3}>
          {/* <Typography variant="h4" sx={{ mb: 2 }}>Welcome to OpenGolfSim Course Meshery! </Typography> */}
          <Typography sx={{ mb: 2 }}>This software requires a few additional tools to run, like PDAL, GDAL, and other geospatial processing libraries. Click Install Tools and we'll set everything up for you.</Typography>
          

          <Stack direction="row" sx={{ py: 4 }} spacing={3}>
            <Box flex={1}>
              <TextField
                label="Install Location"
                value={toolsPath}
                helperText={toolsPath.includes(' ') && 'Spaces in install path can cause issues. Consider selecting a different location on your system without spaces.'}
                error={toolsPath.includes(' ')}
                fullWidth
                size="small"
                slotProps={{ input: { readOnly: true } }}
              />
            </Box>
            <Box>
              <Button color="inherit" onClick={handleInstallChange}>
                Change Install Location
              </Button>
            </Box>
          </Stack>
          
          <Alert severity="info">These extra tools require about {state.requiredSpace} of free disk space and may take a few moments to install</Alert>
        </Stack>
  

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
    <Container
      sx={{ p: 5, alignItems: 'center', height: '100%', display: 'flex' }} maxWidth="sm"
    >
      <Card sx={{ flex: 1 }}>
        <CardHeader title="Install Required Tools" />
        {children}
      </Card>
    </Container>
  )
}