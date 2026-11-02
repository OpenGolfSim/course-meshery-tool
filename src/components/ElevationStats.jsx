import React from 'react';
import { Box, Grid, Typography } from '@mui/material';

function ElevationStatsRow({ label, value }) {
  return (
    <Grid
      container
      sx={theme => ({
        // color: theme.palette.text.secondary,
        fontSize: 10,
      })}
      spacing={1}
    >
      <Grid
        size={4}
        sx={theme => ({
          color: theme.palette.text.secondary,
          textAlign: 'right',
          pr: 1
        })}        
      >
        {label}
      </Grid>
      <Grid size={8}>
        <Typography title={value} noWrap={true} sx={{ fontSize: 10 }} component="div">
          {value}
        </Typography>
      </Grid>
    </Grid>
  )
}

export default function ElevationStats({
  fileName,
  source,
  size,
  height,
  min,
  max,
  heightMapSize
}) {
  
  return (
    <Box sx={{ p: 1 }}>
      <ElevationStatsRow
        label="File"
        value={fileName}
      />
      <ElevationStatsRow
        label="Source"
        value={source}
      />
      <ElevationStatsRow
        label="Size"
        value={`${(size || 0).toFixed(0)}m`}
      />
      <ElevationStatsRow
        label="Height"
        value={`${height.toFixed(2)}m`}
      />
      <ElevationStatsRow
        label="Min"
        value={`${min.toFixed(2)}m`}
      />
      <ElevationStatsRow
        label="Max"
        value={`${max.toFixed(2)}m`}
      />

      {heightMapSize ? (
        <ElevationStatsRow
          label="Resolution"
          value={`${heightMapSize}&times;${heightMapSize}`}
        />
      ) : null}
      
    </Box>
  )
}