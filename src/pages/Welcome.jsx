import React, { useEffect, useState } from 'react';
import { Box, Button, Container, Grid, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Paper, Stack, Typography } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import { useProject } from '../contexts/Project';

export default function Welcome() {
  const { createProject } = useProject();
  const [recents, setRecents] = useState([]);
  const handleNewProject = async () => {
    await createProject();
  }
  const handleOpenRecentProject = async (project) => {
    window.meshery.project.openRecent(project);
  }

  useEffect(() => {
    window.meshery.project.recent().then(result => {
      console.log('recent projects', result);
      setRecents(result);
    });
  }, []);

  return (
    <Container sx={{ p: 5 }} maxWidth="sm">
      <Grid container spacing={5} sx={{ mt: 5 }}>
        <Grid size={12} sx={{ mb: 5 }}>
          <Typography variant="h2" sx={{ mb: 2 }}>OpenGolfSim Meshery</Typography>
          <Typography>Meshery is an experimental tool for building courses for OpenGolfSim. Create a new project to get started building your course.</Typography>
        </Grid>
        <Grid size={12}>
          <Stack spacing={3}>
            <Typography variant="h3">Start</Typography>
            {/* <Typography>Get started with a new project</Typography> */}
            <Button
              fullWidth
              variant="contained"
              color="primary"
              size="large"
              onClick={handleNewProject}
            >
              New Project
            </Button>

            <Button fullWidth>Open Project...</Button>

          </Stack>
        </Grid>
        <Grid size={12}>
          <Typography variant="h3">Recent Projects</Typography>
          {recents.length ? (
            <List>
              {recents.map(recent => {
                return (
                  <ListItemButton key={recent._filePath} onClick={() => handleOpenRecentProject(recent)}>
                    <ListItemIcon>
                      <FolderIcon />
                    </ListItemIcon>
                    <ListItemText primary={recent.name} />
                  </ListItemButton>
                )  
              })}
            </List>
          ) : (
            <Typography color="textSecondary" sx={{ mt: 4, p: 3, textAlign: 'center' }}>None</Typography>
          )}
        </Grid>
      </Grid>
    </Container>
  )
}