import React from 'react';
import { Box, CircularProgress, IconButton, ListItem, ListItemText, ListSubheader, Tooltip } from "@mui/material";
import DownloadIcon from '@mui/icons-material/Download';
import InfoIcon from '@mui/icons-material/Info';

export function ElevationDataDownloadHeader({ title, infoText }) {
  return (
    <ListSubheader
      disableGutters={true}
      disableSticky={true}
      sx={{
        display: 'flex',
        direction: 'row',
        alignItems: 'center',
        lineHeight: '24px'
      }}
    >
      <Box flex={1}>
        {title}
      </Box>

      <Tooltip
        placement="right"
        arrow={true}
        title={infoText}
      >
        <InfoIcon sx={theme => ({ mr: theme.spacing(1.5) })} />
      </Tooltip>
    </ListSubheader>
  )
}
export default function ElevationDataDownload({
  name,
  isPending,
  onDownload,
  ...props
}) {
  return (
    <ListItem
      disableGutters={true}
      // disablePadding={true}
      secondaryAction={
        isPending ? (
          <CircularProgress enableTrackSlot={true} size={20} />
        ) : (
          <Tooltip title="Download">
            <IconButton onClick={onDownload}><DownloadIcon /></IconButton>
          </Tooltip>
        )
      }
      {...props}
    >
      <ListItemText
        primary={name}
        slotProps={{
          primary: {
            title: name,
            noWrap: true, // Applies text-overflow: ellipsis, overflow: hidden, and white-space: nowrap
            sx: theme => ({
              maxWidth: '100%',
              fontSize: 10,
              fontWeight: theme.typography.fontWeightBold
            })
          }
        }}
      />
    </ListItem>
  );
}