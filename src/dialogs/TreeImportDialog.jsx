import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  Typography,
  CircularProgress,
  DialogActions,
  Button,
  Grid,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  DialogTitle,
  Card,
  CardMedia,
  CardContent,
  CardActionArea,
  CardActions,
  LinearProgress,
  Box,
  Stack
} from '@mui/material';


export default function TreeImportDialog(props) {
  const { onClose, open, label } = props;
  const [labelCache, setLabelCache] = useState('');
  const [availablePlants, setAvailablePlants] = useState();
  const [downloadPending, setDownloadPending] = useState();
  const [selectedCategory, setSelectedCategory] = useState('trees');
  
  const filteredPlants = useMemo(() => {
    return availablePlants?.[selectedCategory] || [];
  }, [availablePlants, selectedCategory]);

  const handleClose = (event, reason) => {
    // if (reason === 'backdropClick') {
      event.preventDefault();
    // }
    // onClose();
  };

  const handlePlantChange = (update) => {
    console.log('update', update);
    refreshPlantCache();
  }
  const handleImportAsset = async (plant) => {
    onClose(plant);
  }
  const handleCustomCreate = () => {
    window.meshery.trees.createCustom();
  }
  const handleDownloadPlant = async (plant) => {
    console.log('download', plant);
    setDownloadPending(plant?.id);
    const res = await window.meshery.trees.downloadPlantAsset(plant);
    console.log('loaded-trees', res);
    if (res) {
      setAvailablePlants(res);
    }
    setDownloadPending(undefined);
  }
  const refreshPlantCache = () => {
    window.meshery.trees.getAvailablePlants().then(plants => {
      console.log('plants', plants);
      setAvailablePlants(plants);
    });
  }

  useEffect(() => {
    refreshPlantCache();
    window.meshery.on('plant.change', handlePlantChange);
    return () => {
      window.meshery.off('plant.change', handlePlantChange);
    }
  }, []);

  return (
    <Dialog
      onClose={handleClose}
      open={open}
      maxWidth="md"
      fullWidth={true}
      Pap
      slotProps={{ paper: { elevation: 1, sx: { height: '500px' } } }}
    >
      <DialogTitle>Plant Vegetation</DialogTitle>
      <DialogContent>
        <Grid container spacing={2}>
          <Grid size={2}>
            <List>
              <ListItemButton selected={selectedCategory === 'trees'} onClick={(e) => setSelectedCategory('trees')}>
                <ListItemText primary="Trees" />
              </ListItemButton>
              <ListItemButton selected={selectedCategory === 'grasses'} onClick={(e) => setSelectedCategory('grasses')}>
                <ListItemText primary="Grasses" />
              </ListItemButton>
              <ListItemButton selected={selectedCategory === 'rocks'} onClick={(e) => setSelectedCategory('rocks')}>
                <ListItemText primary="Rocks" />
              </ListItemButton>
              <ListItemButton selected={selectedCategory === 'buildings'} onClick={(e) => setSelectedCategory('buildings')}>
                <ListItemText primary="Buildings" />
              </ListItemButton>
              <ListItemButton selected={selectedCategory === 'custom'} onClick={(e) => setSelectedCategory('custom')}>
                <ListItemText primary="Custom" />
              </ListItemButton>
            </List>
          </Grid>
          <Grid size={10}>
              {selectedCategory === 'custom' ? (
                <Box sx={{ mb: 2 }}>
                  <Button
                    onClick={handleCustomCreate}
                    color="secondary"
                    variant="contained"
                  >
                    Create Custom Asset
                  </Button>
                </Box>
              ) : null}

              {!filteredPlants.length ? (
                <Stack spacing={3} sx={{ alignItems: 'center' }}>
                {selectedCategory === 'custom' ? (
                  <>
                    <Typography>No assets exist yet</Typography>
                  </>
                ) : (
                  <Typography>Coming soon</Typography>
                )}
                </Stack>
              ) : (
                <Grid container spacing={3}>
                  {filteredPlants.map(tree => {
                    return (
                      <Grid size={3} key={tree.id}>
                        <Card variant="outlined">
                          <CardMedia
                            sx={{ height: 150, backgroundColor: '#aaa' }}
                            image={tree.thumbnail}
                          />
                          <CardContent>
                            <Typography variant="h5" component="div">
                              {tree.title}
                            </Typography>
                          </CardContent>
                          <CardActions>
                            {tree._cache?._fileExists ? (
                              <Button
                                fullWidth={true}
                                variant="contained"
                                color="inherit"
                                onClick={() => handleImportAsset(tree)}
                              >
                                Import Asset
                              </Button>
                            ) : (
                              <Button
                                disabled={!!downloadPending}
                                variant="contained"
                                startIcon={downloadPending === tree.id && <CircularProgress color="inherit" size={14} />}
                                color={!downloadPending ? 'primary' : 'secondary'}
                                fullWidth={true}
                                onClick={() => handleDownloadPlant(tree)}
                              >
                                {downloadPending === tree.id ? 'Downloading' : 'Download'}
                              </Button>
                            )}
                          </CardActions>
                        </Card>
                      </Grid>
                    )
                  })}
                </Grid>
              )}
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
 
}