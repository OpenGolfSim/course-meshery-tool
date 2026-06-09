import React, { Fragment, useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, CircularProgress, Alert, Grid, List, ListItem, Checkbox, ListItemIcon, Stack, ListItemText, Link, Chip, FormControlLabel, FormControl, Tooltip } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import InfoIcon from '@mui/icons-material/Info';
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
  const [included, setIncluded] = useState({ hillShade: true, satellite: true, shapes: false });
  
  const handleSkip = useCallback(async () => {
    setExportState(old => ({ ...old, phase: 'export' }));
  }, []);

  const handleSearch = useCallback(async () => {
    setIsPending(true);
    setResults(null);
    try {
      const centerTurfPoint = turf.point([project.settings.centerPoint.lng, project.settings.centerPoint.lat]);
      const buffer = turf.buffer(centerTurfPoint, (project.settings.distance / 2), { units: 'kilometers' });
      const bbox = turf.bbox(buffer);
      const [west, south, east, north] = bbox;
      const coords = [south, west, north, east];
      console.log('find shapes for', coords);
      // const rest = await searchOSMShapes(coords);
      const response = await window.meshery.map.searchShapes(coords);
      console.log('response', response);
      setResults({ paths: response?.coursePaths, success: true });
      if (response?.coursePaths?.length) {
        setIncluded(old => ({ ...old, shapes: true }));
      }
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
      maxWidth="xs"
      onClose={onClose}
      open={open}
      slotProps={{ paper: { elevation: 1 } }}
    >
      {/* <DialogTitle>
        Generate SVG
      </DialogTitle> */}
      <DialogContent>

        <Stack spacing={3} sx={{ alignItems: 'center', justifyItems: 'center', textAlign: 'center' }}>
          <Typography variant="h4">Export SVG</Typography>
        </Stack>

        <Stack sx={{ p: 5 }} spacing={3}>
          <FormControl>
            <FormControlLabel
              disabled={!project?.hillShade}
              control={(
                <Checkbox
                  checked={included.hillShade}
                  onChange={(e) => setIncluded(old => ({ ...old, hillShade: e.target.checked }))}
                />
              )}
              label="Include Hillshade"
            />
            <Typography>
              {project?.hillShade?.filePathJPEG?.split(/[\\\/]/).pop()}
            </Typography>
          </FormControl>
          
          <FormControl>
            <FormControlLabel
              disabled={!project?.satellite}
              control={(
                <Checkbox
                  checked={included.satellite}
                  onChange={(e) => setIncluded(old => ({ ...old, satellite: e.target.checked }))}
                />
              )}
              label="Include Satellite"
            />
            <Typography>
              {Object.values(project?.satellite)?.[0]?.filePathJPEG?.split(/[\\\/]/).pop()}
            </Typography>
          </FormControl>

          <Box>
            <FormControlLabel
              disabled={!results}
              control={(
                <Checkbox
                  onChange={(e) => setIncluded(old => ({ ...old, shapes: e.target.checked }))}
                  checked={included.shapes}
                />
              )}
              label={(
                <Stack direction="row" spacing={2}>
                  <Typography flex={1}>Include Shapes</Typography>
                  <Tooltip
                    title="Meshery can auto generate rough course shapes from the OpenStreetMap database of golf features."
                  >
                    <InfoIcon />
                  </Tooltip>
                </Stack>
              )}
            />
                        
            <Box>
              {results ? (
                <Box>
                  <Chip
                    icon={<CheckIcon />}
                    label={`${results.paths.length} shapes available`}
                  />
                  {error ? (
                    <Alert severity="error">{error}</Alert>
                  ) : null}
                </Box>
              ) : (
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={isPending && <CircularProgress size={18} />}
                  disabled={isPending}
                  onClick={handleSearch}
                >
                  Search OSM Shapes
                </Button>
              )}
            </Box>
          </Box>
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
          variant="contained"
          color="secondary"
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