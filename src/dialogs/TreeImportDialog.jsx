import React, { useEffect, useState } from 'react';
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
  const handleClose = (event, reason) => {
    // if (reason === 'backdropClick') {
      event.preventDefault();
    // }
    // onClose();
  };

  const handlePlantChange = (update) => {
    console.log('update', update);
  }
  const handleImportAsset = async (plant) => {
    onClose(plant);
  }
  const handleDownloadPlant = async (plant) => {
    console.log('download', plant);
    setDownloadPending(plant?.id);
    const res = await window.meshery.trees.downloadPlantAsset(plant);
    console.log('res', res);
    if (res) {
      setAvailablePlants(res);
    }
    setDownloadPending(undefined);
  }

  useEffect(() => {
    window.meshery.trees.getAvailablePlants().then(plants => {
      console.log('plants', plants);
      setAvailablePlants(plants);
    });
    // window.meshery.on('plant.change', handlePlantChange);
    // return () => {
    //   window.meshery.off('plant.change', handlePlantChange);
    // }
  }, []);

  return (
    <Dialog
      onClose={handleClose}
      open={open}
      maxWidth="md"
      fullWidth={true}
      slotProps={{ paper: { elevation: 1 } }}
    >
      <DialogTitle>Plant Vegetation</DialogTitle>
      <DialogContent>
        <Grid container spacing={2}>
          <Grid size={2}>
            <List>
              <ListItemButton selected={true}>
                <ListItemText primary="Trees" />
              </ListItemButton>
              <ListItemButton>
                <ListItemText primary="Grasses" />
              </ListItemButton>
              <ListItemButton>
                <ListItemText primary="Rocks" />
              </ListItemButton>
              <ListItemButton>
                <ListItemText primary="Houses" />
              </ListItemButton>
            </List>
          </Grid>
          <Grid size={10}>
            <Grid container spacing={3}>
              {availablePlants?.trees?.map(tree => {
                return (
                  <Grid size={3} key={tree.title}>
                    <Card variant="outlined">
                      <CardMedia
                        sx={{ height: 150 }}
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
                );
              })}
            </Grid>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
 
}