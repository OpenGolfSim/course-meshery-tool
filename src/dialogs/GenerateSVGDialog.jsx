import React, { Fragment, useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, CircularProgress, Alert, Grid, List, ListItem, Checkbox, ListItemIcon, Stack, ListItemText, Link, Chip } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import { useProject } from '../contexts/Project';
import * as turf from '@turf/turf';

export default function SearchShapesDialog(props) {
  const { project, searchOSMShapes } = useProject();
  const { onClose, open } = props;
  const [exportState, setExportState] = useState({ phase: 'search' });
  const [isPending, setIsPending] = useState(false);
  const [endpoints, setEndpoints] = useState([]);
  const [results, setResults] = useState(null);
  const [error, setError] = useState();
  
  const handleSkip = useCallback(async () => {
    setExportState(old => ({ ...old, phase: 'export' }));
  }, []);

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
      setResults({ paths: response?.coursePaths, success: true });
      setExportState(old => ({ ...old, phase: 'export' }));
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
        Generate SVG
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center' }}>


        <Stack spacing={3} sx={{ alignItems: 'center', justifyItems: 'center' }}>

          <Typography variant="h4">Search Course Shapes</Typography>
          <Typography>Meshery can auto generate rough course shapes from the <Link onClick={() => window.meshery.openExternalUrl('https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dgolf_course')}>OpenStreetMap</Link> database of golf features. Would you like to search for existing shapes to include?</Typography>
          
          {results ? (
            <Box>
              <Chip
                icon={<CheckIcon />}
                label={`Added ${results.paths.length} shapes`}
              />
              {error ? (
                <Alert severity="error">{error}</Alert>
              ) : null}
            </Box>
          ) : (
            <Button
              variant="outlined"
              color="primary"
              startIcon={isPending && <CircularProgress />}
              disabled={isPending}
              onClick={handleSearch}
            >
              Search OSM Shapes
            </Button>
          )}


        </Stack>

        {/* <Grid container={true}>
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
          </Grid>

        </Grid> */}

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

        {/* {exportState.phase === 'search' ? (
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
              // variant="outlined"
              color="inherit"
              disabled={isPending}
              onClick={handleSkip}
            >
              Skip
            </Button>
            
        </DialogActions>
        ) : null}

        {exportState.phase === 'export' ? (
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
        ) : null} */}
    </Dialog>
  );
 
}