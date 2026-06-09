import React from 'react';
import { Button, IconButton, ListItem, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import MoreIcon from '@mui/icons-material/MoreVert';

export function CustomListButtonItem({
  button,
  children
}) {
  if (button) {
    return <ListItemButton {...button}>{children}</ListItemButton>
  }
  return children;
}

export default function CustomListItem({
  icon,
  secondary,
  label,
  hidden,
  endIcon,
  endAction,
  menuItems,
  size,
  button,
  selected,
  ...rest
}) {
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
    <>
      <ListItem

        sx={theme => ({ backgroundColor: selected ? theme.palette.primary.dark : undefined })}
        secondaryAction={
          endAction ? endAction : (menuItems?.length && <IconButton size={size} onClick={handleClick}><MoreIcon /></IconButton>)
          // menuItems?.length ? <IconButton onClick={handleClick}><MoreIcon /></IconButton> : (
            // endAction ? endAction : null
        }
        disablePadding={!!button}
        {...rest}
      >
        <CustomListButtonItem button={button}>
          {icon ? (
            <ListItemIcon
              sx={{ minWidth: size === 'small' ? 24 : 30 }}
            >
              {icon}
            </ListItemIcon>
          ) : null}

          <ListItemText
            primary={label}
            secondary={secondary}
            slotProps={{
              secondary: { sx: { textTransform: 'capitalize' } },
              primary: {
                ...hidden && { color: 'textSecondary' },
                noWrap: true, // Applies text-overflow: ellipsis, overflow: hidden, and white-space: nowrap
                sx: {
                  maxWidth: '100%',
                  fontSize: 11,
                  ...size === 'small' && { fontSize: 9 }
                } // Ensure the typography component respects the parent's width
              }
            }}
          />

        {endIcon ? (
          <ListItemIcon sx={{ minWidth: 30 }}>
            {endIcon}
          </ListItemIcon>
        ) : null}
        </CustomListButtonItem>

      </ListItem>
      {menuItems?.length ? (
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
          {menuItems?.map(item => (
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
      ) : null}
    </>
  )
}