import React, { Fragment, useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, CircularProgress, Alert, Grid, List, ListItem, Checkbox, ListItemIcon, Stack, ListItemText } from '@mui/material';
import { useProject } from '../contexts/Project';
import * as turf from '@turf/turf';

export default function SearchShapesDialog(props) {
  const { project, searchOSMShapes } = useProject();
  const { onClose, open } = props;
  const [isPending, setIsPending] = useState(false);
  const [endpoints, setEndpoints] = useState([]);
  const [results, setResults] = useState(null);
  const [error, setError] = useState();
  
  const handleSearch = useCallback(async () => {
    setIsPending(true);
    setResults(null);
    try {
      const centerTurfPoint = turf.point([project.settings.centerPoint.lng, project.settings.centerPoint.lat]);
      const buffer = turf.buffer(centerTurfPoint, project.settings.distance, { units: 'kilometers' });
      const bbox = turf.bbox(buffer);
      const [west, south, east, north] = bbox;
      const coords = [south, west, north, east];
      console.log('find shapes for', coords);
      // const rest = await searchOSMShapes(coords);
      const response = await window.meshery.map.searchShapes(coords);
      console.log('response', response);
      setResults(response.coursePaths);
    } catch (error) {
      console.log(error);
      setError(`${error}`);
    } finally {
      setIsPending(false);
    }
  }, [project.settings]);

  const handleSave = useCallback(async () => {
    console.log('save it', results);
    const file = await window.meshery.project.saveSVG();
    if (props.onSave) {
      props.onSave();
    }
  }, [results]);

  useEffect(() => {
    if (!props.open || !project.settings.centerPoint || !project.settings.distance) {
      return;
    }    
    window.meshery.map.listEndpoints().then(result => {
      setEndpoints(result);
    });
    // handleSearch();
  }, [props.open]);

  return (
    <Dialog
      fullWidth={true}
      maxWidth="sm"
      onClose={onClose}
      open={open}
    >
      <DialogTitle>
        Search OSM Golf Data
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center' }}>
        <Grid container={true}>
          <Grid size={4}>OpenStreetMap Shapes</Grid>
          <Grid size={8}>
            {isPending ? (
              <Stack direction="row" spacing={1}><CircularProgress /><Typography>Searching</Typography></Stack>
            ) : (
              results?.length ? (
                <Typography>{results.length} shapes</Typography>
              ) : (
                <Button onClick={handleSearch}>Search Shapes</Button>
              )
            )}
            {/* {isPending ? (
              <>
                <CircularProgress />
                <Typography>Searching shapes at {JSON.stringify(project.settings.centerPoint)}</Typography>
              </>
            ) : (
              results?.length ? (
                <Typography>{results.length} shapes</Typography>
              ) : (
                <Typography>No existing course shapes found</Typography>
              )
            )} */}
          </Grid>

          <Grid size={4}>Imagery</Grid>
          <Grid size={8}>
            <List>
              <ListItem>
                <ListItemIcon>
                  <Checkbox
                    edge="start"
                    tabIndex={-1}
                    disableRipple
                  />
                </ListItemIcon>
                <ListItemText primary="Satellite" />
              </ListItem>
            </List>
          </Grid>

        </Grid>

        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ display: 'flex', flexDirection: 'row' }}>
        <Button
          fullWidth
          variant="text"
          color="inherit"
          onClick={props.onClose}
        >
          Cancel
        </Button>
        <Button
          fullWidth
          variant="contained"
          color="primary"
          disabled={isPending}
          onClick={handleSave}
        >
          Export SVG
        </Button>
      </DialogActions>
    </Dialog>
  );
 
}