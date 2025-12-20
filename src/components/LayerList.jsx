import React, { useEffect } from 'react';
import { Box, Typography, List, Chip } from '@mui/material';
import LayerListItem from './LayerListItem.jsx';

export default function LayerList({ svgFile, layers, onZoom, onDelete, selectedLayer, onExpanded, onSettingChanged }) {
  // const [expanded, setExpanded] = React.useState(false);

  
  const handleChange = (panel, isExpanded) => {
    // console.log('panel, isExpanded', panel, isExpanded);
    // setExpanded(isExpanded ? panel : false);
    if (onExpanded) {
      onExpanded(isExpanded ? panel : false);
    }
  };
  
  return (
    <Box>
      {/* <Typography sx={{ p: 1 }} variant="subtitle2" color="textSecondary">Layers</Typography> */}
      <Box>
        {layers.map(layer => (
          <LayerListItem
            key={layer.id}
            layer={layer}
            expanded={selectedLayer === layer.id}
            onZoom={onZoom}
            onSettingChanged={onSettingChanged}
            onExpand={handleChange}
           />
        ))}
      </Box>
    </Box>    
  )
}