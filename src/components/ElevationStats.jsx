import React from 'react';
import { Grid } from '@mui/material';


export default function ElevationStats({
  source,
  size,
  height,
  min,
  max,
  heightMapSize
}) {
  
  return (
    <Grid
      container
      sx={theme => ({
        color: theme.palette.text.secondary,
        fontSize: 10,
        p: 1
      })}
    >
      <Grid size={6} sx={{ textAlign: 'right', pr: 1 }}>Source</Grid>
      <Grid size={6}>{source}</Grid>
      <Grid size={6} sx={{ textAlign: 'right', pr: 1 }}>Terrain Size</Grid>
      <Grid size={6}>{(size || 0).toFixed(0)}m</Grid>
      <Grid size={6} sx={{ textAlign: 'right', pr: 1 }}>Terrain Height</Grid>
      <Grid size={6}>{height.toFixed(2)}m</Grid>
      <Grid size={6} sx={{ textAlign: 'right', pr: 1 }}>Min</Grid>
      <Grid size={6}>{min.toFixed(2)}m</Grid>
      <Grid size={6} sx={{ textAlign: 'right', pr: 1 }}>Max</Grid>
      <Grid size={6}>{max.toFixed(2)}m</Grid>
      
      {heightMapSize ? (
        <React.Fragment>
          <Grid size={6} sx={{ textAlign: 'right', pr: 1 }}>Resolution</Grid>
          <Grid size={6}>{heightMapSize}&times;{heightMapSize}</Grid>
        </React.Fragment>
      ) : null}
    </Grid>
  )
}