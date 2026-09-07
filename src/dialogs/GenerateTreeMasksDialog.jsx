import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  Alert,
  Stack,
  Box,
  FormControlLabel,
  Checkbox,
  CircularProgress,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/CheckCircle';
import { useProject } from '../contexts/Project.jsx';
import NumberField from '../components/NumberField.jsx';

const DEFAULT_SETTINGS = {
  sourcesEnabled: { osmPoints: true, osmWoods: true, canopyFallback: true, landCoverSpecies: true },
  pointRadiusPx: 2,
  baselineDensityBySource: { osm: 0.3, canopy: 0.3 },
};

export default function GenerateTreeMasksDialog({ open, onClose }) {
  const { generateTreeMasks } = useProject();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [jobState, setJobState] = useState({ phase: 'settings', progress: 0 });

  const handleClose = () => onClose();

  const handleSourceToggle = (key) => (event) => {
    setSettings((old) => ({
      ...old,
      sourcesEnabled: { ...old.sourcesEnabled, [key]: event.target.checked },
    }));
  };

  const handlePointRadiusChange = (value) => {
    setSettings((old) => ({ ...old, pointRadiusPx: value }));
  };

  const handleDensityChange = (source) => (value) => {
    setSettings((old) => ({
      ...old,
      baselineDensityBySource: { ...old.baselineDensityBySource, [source]: value },
    }));
  };

  const handleConfirm = useCallback(async () => {
    setJobState({ phase: 'generate', progress: 0 });
    try {
      const result = await generateTreeMasks(settings);
      setJobState({ phase: 'complete', progress: 100, summary: result?.summary });
    } catch (error) {
      setJobState({ phase: 'complete', progress: 100, error: error?.message || String(error) });
    }
  }, [settings, generateTreeMasks]);

  const handleProgressUpdate = useCallback((_evt, update) => {
    setJobState((old) => ({ ...old, ...update }));
  }, []);

  useEffect(() => {
    window.meshery.on('trees.generate.progress', handleProgressUpdate);
    if (!open) {
      setJobState({ phase: 'settings', progress: 0 });
    }
    return () => {
      window.meshery.off('trees.generate.progress', handleProgressUpdate);
    };
  }, [open, handleProgressUpdate]);

  return (
    <Dialog onClose={handleClose} open={open} maxWidth="sm" fullWidth slotProps={{ paper: { elevation: 1 } }}>
      <DialogTitle>Generate Tree Masks</DialogTitle>

      <DialogContent>
        {jobState.phase === 'settings' ? (
          <Stack spacing={3}>
            <Typography color="textSecondary" variant="body2">
              Auto-generates tree-mask layers from OpenStreetMap tree points/wooded areas and
              public canopy-height data, split into separate layers by source and height band.
              Canopy data never paints over ground OSM already covers. Re-running this replaces
              only previously auto-generated layers - any hand-painted layers are left untouched.
            </Typography>

            <Box>
              <Typography variant="h3" sx={{ mb: 1 }}>Data Sources</Typography>
              <FormControlLabel
                control={<Checkbox checked={settings.sourcesEnabled.osmPoints} onChange={handleSourceToggle('osmPoints')} />}
                label="Use OSM individual tree points"
              />
              <FormControlLabel
                control={<Checkbox checked={settings.sourcesEnabled.osmWoods} onChange={handleSourceToggle('osmWoods')} />}
                label="Use OSM wooded area / forest polygons"
              />
              <FormControlLabel
                control={<Checkbox checked={settings.sourcesEnabled.canopyFallback} onChange={handleSourceToggle('canopyFallback')} />}
                label="Use public canopy-height data to fill gaps OSM doesn't cover"
              />
              <FormControlLabel
                control={<Checkbox checked={settings.sourcesEnabled.landCoverSpecies} onChange={handleSourceToggle('landCoverSpecies')} />}
                label="Auto-select species from forest-type/land-cover data"
              />
            </Box>

            <Box>
              <Typography variant="h3" sx={{ mb: 1 }}>Tree Point Size</Typography>
              <NumberField
                value={settings.pointRadiusPx}
                onChange={handlePointRadiusChange}
                fullWidth
                label="Point Radius (mask pixels)"
                min={0}
                step={1}
                max={20}
              />
              <Typography color="textSecondary" variant="caption">
                An individual OSM tree point is painted as a filled circle of this radius rather
                than a single pixel, since a lone pixel often plants zero or one tiny tree. Tune
                this against the generated result to get good tree density/size.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h3" sx={{ mb: 1 }}>Density by Source</Typography>
              <Stack direction="row" spacing={2}>
                <NumberField
                  value={settings.baselineDensityBySource.osm}
                  onChange={handleDensityChange('osm')}
                  fullWidth
                  label="OSM layers"
                  min={0}
                  step={0.05}
                  max={2}
                />
                <NumberField
                  value={settings.baselineDensityBySource.canopy}
                  onChange={handleDensityChange('canopy')}
                  fullWidth
                  label="Canopy layers"
                  min={0}
                  step={0.05}
                  max={2}
                />
              </Stack>
              <Typography color="textSecondary" variant="caption">
                Overall planting density for each source's layers, tunable independently - e.g.
                turn Canopy down for just a smattering of trees in gap-filled areas without
                affecting the OSM-derived layers.
              </Typography>
            </Box>
          </Stack>
        ) : null}

        {jobState.phase === 'generate' ? (
          <Stack spacing={3} sx={{ justifyItems: 'center', alignItems: 'center' }}>
            <CircularProgress enableTrackSlot={true} variant="determinate" value={jobState.progress} />
            <Typography>{jobState.status || 'Generating tree masks...'}</Typography>
          </Stack>
        ) : null}

        {jobState.phase === 'complete' ? (
          <Stack spacing={3} sx={{ justifyItems: 'center', alignItems: 'center' }}>
            <Box>
              {!jobState.error ? <CheckIcon color="success" sx={{ fontSize: 48 }} /> : null}
            </Box>
            {jobState.error ? (
              <Alert severity="error">{jobState.error}</Alert>
            ) : (
              <Stack spacing={0.5} sx={{ alignItems: 'center' }}>
                <Typography color="textSecondary">
                  {jobState.summary
                    ? `Found ${jobState.summary.osmPointCount} tree point(s) and ${jobState.summary.osmWoodCount} wooded area(s).`
                    : 'Tree masks have been generated.'}
                </Typography>
                {jobState.summary?.layersGenerated?.length ? (
                  jobState.summary.layersGenerated.map((layer) => (
                    <Typography key={layer.name} color="textSecondary" variant="body2">
                      {layer.name}: {layer.pixelCount} mask pixel(s)
                    </Typography>
                  ))
                ) : (
                  <Typography color="textSecondary" variant="body2">No layers were generated - no matching data was found in the course bounds.</Typography>
                )}
              </Stack>
            )}
          </Stack>
        ) : null}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} color="secondary" variant="contained">
          {jobState.phase === 'complete' ? 'Done' : 'Cancel'}
        </Button>
        <Button
          onClick={handleConfirm}
          color="primary"
          variant="contained"
          disabled={jobState.phase !== 'settings'}
        >
          Generate
        </Button>
      </DialogActions>
    </Dialog>
  );
}
