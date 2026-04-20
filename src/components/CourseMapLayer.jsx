import React from 'react';
import { Button, IconButton, ListItem, ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import MoreIcon from '@mui/icons-material/MoreVert';

export default function CourseMapLayer(props) {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const open = Boolean(anchorEl);
  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  const handleItemClick = (callback) => {
    if (callback) { callback(); }
    handleClose();
  }

  return (
    <ListItem secondaryAction={<IconButton onClick={handleClick}><MoreIcon /></IconButton>}>
      {props.icon ? (
        <ListItemIcon
          sx={{ minWidth: 30 }}
        >
          {props.icon}
        </ListItemIcon>
      ) : null}
      <ListItemText
        primary={props.label}
        secondary={props.secondary}
        slotProps={{
          secondary: { sx: { textTransform: 'capitalize' } },
          primary: {
            ...props.hidden && { color: 'textSecondary' },
            noWrap: true, // Applies text-overflow: ellipsis, overflow: hidden, and white-space: nowrap
            sx: { maxWidth: '100%', fontSize: 11 } // Ensure the typography component respects the parent's width
          }
        }}
      />
      {props.endIcon ? (
        <ListItemIcon sx={{ minWidth: 30 }}>
          {props.endIcon}
        </ListItemIcon>
      ) : null}
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        slotProps={{
          list: {
            'aria-labelledby': 'basic-button',
          },
        }}
      >
        {props.menuItems.map(item => (
          <MenuItem
            key={item.label}
            disabled={item.disabled}
            onClick={() => handleItemClick(item.onClick)}
          >
            {item.icon ? (
              <ListItemIcon>
                {item.icon}
              </ListItemIcon>
            ) : null}
            <ListItemText>
              {item.label}
            </ListItemText>
          </MenuItem>
        ))}
        {/* <MenuItem onClick={handleClose}>My account</MenuItem>
        <MenuItem onClick={handleClose}>Logout</MenuItem> */}
      </Menu>
    </ListItem>    
  )
}