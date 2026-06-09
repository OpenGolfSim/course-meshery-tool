import React, { useMemo, useRef, useState } from 'react';
import { List, ListItem, ListItemText, IconButton, ListItemAvatar, Avatar, Stack, Box, Typography, Collapse, ListItemButton, TextField, MenuItem, Button, ListItemIcon, Menu, ListSubheader, Divider } from '@mui/material';
import LocationPin from '@mui/icons-material/LocationPin';
import MoreButton from '@mui/icons-material/MoreHoriz';
import Clear from '@mui/icons-material/Clear';
import NumberField from './NumberField';
import { useProject } from '../contexts/Project';

function WaypointListItem({ label, waypoint, hole, editState, onSet, onClear }) {
  const hasValue = useMemo(() => waypoint && !!hole?.[waypoint], [waypoint, hole]);
  const isEditing = useMemo(() => editState?.hole === hole.number && editState?.waypoint === waypoint, [editState, waypoint, hole]);

  return (
    <Stack direction="row" alignItems="center">
      <Typography
        component={Button}
        disabled={!hasValue}
        color="inherit"
        sx={{
          justifyContent: 'flex-start',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.06)'
          }
        }}
        flex={1}
        // color="textSecondary"
        variant="h5"
        // sx={{ fontWeight: 'bold', fontSize: 11, t }}
      >
        {label}
      </Typography>
      <Box>
        {hasValue ? <IconButton onClick={onClear} size="small"><Clear /></IconButton> : null}
        <IconButton
          size="small"
          onClick={onSet}
          color={isEditing ? 'primary' : 'inherit'}
        >
          <LocationPin />
        </IconButton>
      </Box>
    </Stack>
  )
}
function HolesListItem({
  hole,
  editState,
  onSet,
  onParChange,
  onClear,
  onRemove,
  onZoom,
}) {
  const { editHole } = useProject();
  const [showDetails, setShowDetails] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null);
  // const menuAnchor = useRef();


  const handleParChange = (par) => {
    editHole(hole.number, { par });
  }  
  const wrapInClose = () => {
    setMenuOpen(null);
  }

  return (
    <React.Fragment>
      <ListItem
        disablePadding
        secondaryAction={(
          <IconButton size="small" onClick={(e) => setMenuOpen(e.target)}>
            <MoreButton />
          </IconButton>
        )}
      >
        <ListItemButton
          onClick={() => setShowDetails(old => !old)}
          key={hole.number}
        >
          <ListItemAvatar sx={{ minWidth: 30 }} onClick={() => {}} >
            <Avatar sx={theme => ({
              color: '#fff',
              backgroundColor: '#de3f3f',
              fontFamily: 'monospace',
              width: 20,
              height: 20,
              fontSize: 12,
              fontWeight: theme.typography.fontWeightBold
            })}>{hole.number}</Avatar>
          </ListItemAvatar>
          <ListItemText
            slotProps={{
              primary: {
                sx: theme => ({
                  fontWeight: theme.typography.fontWeightBold,
                  fontSize: theme.typography.fontSize
                })
              }
            }}
            primary={`Par ${hole.par}`}
          />
        </ListItemButton>
      </ListItem>
      <Collapse in={showDetails}>
        <Stack direction="column" sx={{ px: 3 }}>
          
          <WaypointListItem
            label="Tee"
            waypoint="tee"
            hole={hole}
            editState={editState}
            onSet={() => onSet({ hole: hole.number, waypoint: 'tee' })}
            onClear={() => onClear({ hole: hole.number, waypoint: 'tee' })}
          />
          <WaypointListItem
            label="Pin"
            waypoint="pin"
            hole={hole}
            editState={editState}
            onSet={() => onSet({ hole: hole.number, waypoint: 'pin' })}
            onClear={() => onClear({ hole: hole.number, waypoint: 'pin' })}
          />
          <WaypointListItem
            label="Aim"
            waypoint="aim"
            hole={hole}
            editState={editState}
            onSet={() => onSet({ hole: hole.number, waypoint: 'aim' })}
            onClear={() => onClear({ hole: hole.number, waypoint: 'aim' })}
          />
          {/* <Box sx={{ mt: 1 }}>
            <NumberField
              // label="Par"
              size="small"
              variant="contained"
              fullWidth
              defaultValue={hole.par}
              min={3}
              max={5}
              step={1}
            />
          </Box> */}
        </Stack>
      </Collapse>
      <Menu open={Boolean(menuOpen)} anchorEl={menuOpen} onClose={() => setMenuOpen(null)}>
        {/* <ListSubheader>Par</ListSubheader> */}
        <MenuItem selected={hole.par === 3} onClick={() => wrapInClose(handleParChange(3))}>Par 3</MenuItem>
        <MenuItem selected={hole.par === 4} onClick={() => wrapInClose(handleParChange(4))}>Par 4</MenuItem>
        <MenuItem selected={hole.par === 5} onClick={() => wrapInClose(handleParChange(5))}>Par 5</MenuItem>
        <Divider />
        <MenuItem onClick={() => wrapInClose(onZoom())}>Zoom</MenuItem>
        <MenuItem onClick={() => wrapInClose(onRemove())}>Remove Hole</MenuItem>
      </Menu>
    </React.Fragment>
  );
}
export default function HolesList({
  holeData,
  editState,
  onSet,
  onClear,
  onRemove,
  onZoom,
  onParChange
}) {
  return (
    <List>
      {holeData.map((hole, index) =>
        [
          hole.number === 10 && <ListSubheader disablePadding>Back Nine</ListSubheader>,
          <HolesListItem
            hole={hole}
            editState={editState}
            onSet={onSet}
            onClear={onClear}
            onRemove={() => onRemove(hole)}
            onZoom={() => onZoom(hole)}
          />
        ]
      )}
    </List>
  )
}