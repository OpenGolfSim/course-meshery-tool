import * as React from 'react';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import MountainIcon from '@mui/icons-material/Landscape';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Grow from '@mui/material/Grow';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import { useMeshery } from '../contexts/Meshery.jsx';
import { ListItemIcon, Typography } from '@mui/material';

export default function TerrainImportButton({ onSettingsOpen }) {
  const {
    settings,
    setSettings,
    setInputHeightMap,
    setSystemLoading,
    setSystemError,
    clearTerrain
  } = useMeshery();
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef(null);
  const filename = React.useMemo(() => {
    return settings.rawFilePath?.split('/').pop();
  }, [settings.rawFilePath]);
  // const [selectedIndex, setSelectedIndex] = React.useState(1);

  const handleClick = async () => {
    const result = await window.meshery.selectTerrainFile();
    // if (result?.raw) {
    //   setOpenTerrainFile(result.raw);
    // }
    if (result?.raw) {
      if (!result?.heightMap) {
        setSystemError('Raw file seems to be missing height-map data');
        return;
      }
      // setSystemLoading('Reading RAW file...');
      setSettings(settings => ({
        ...settings,
        rawFilePath: result?.raw,
        terrainSize: result?.terrainSize,
      }));
      setInputHeightMap(result.heightMap);
      onSettingsOpen();
    }    
  };

  const handleMenuItemClick = (event) => {
    // setSelectedIndex(index);
    setOpen(false);
  };

  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };

  const handleCloseFile = (event) => {
    clearTerrain();
    handleClose(event);
  };


  const handleClose = (event) => {
    if (anchorRef.current && anchorRef.current.contains(event.target)) {
      return;
    }

    setOpen(false);
  };

  return (
    <React.Fragment>
      <ButtonGroup
        variant="contained"
        color={!settings.rawFilePath ? 'primary' : 'secondary'}
        ref={anchorRef}
        aria-label="Button group with a nested menu"
      >
        <Button disabled={!!filename} startIcon={<MountainIcon />} onClick={handleClick}>
          {!settings.rawFilePath ? 'Import RAW Terrain' : `${filename} (${settings.terrainSize}x${settings.terrainSize})`}
        </Button>
        <Button
          size="small"
          aria-controls={open ? 'split-button-menu' : undefined}
          aria-expanded={open ? 'true' : undefined}
          aria-label="select merge strategy"
          aria-haspopup="menu"
          onClick={handleToggle}
        >
          <ArrowDropDownIcon />
        </Button>
      </ButtonGroup>
      <Popper
        sx={{ zIndex: 1 }}
        open={open}
        anchorEl={anchorRef.current}
        role={undefined}
        transition
        disablePortal
      >
        {({ TransitionProps, placement }) => (
          <Grow
            {...TransitionProps}
            style={{
              transformOrigin:
                placement === 'bottom' ? 'center top' : 'center bottom',
            }}
          >
            <Paper>
              <ClickAwayListener onClickAway={handleClose}>
                <MenuList id="split-button-menu" autoFocusItem>
                  {/* <MenuItem divider={true} /> */}
                  <MenuItem onClick={onSettingsOpen} disabled={!settings.rawFilePath}>
                    <ListItemIcon>
                      <SettingsIcon fontSize="small" />
                    </ListItemIcon>
                    Terrain Settings
                  </MenuItem>

                  {filename ? (
                    <MenuItem
                      onClick={handleCloseFile}
                    >
                      <ListItemIcon>
                        <CloseIcon fontSize="small" />
                      </ListItemIcon>
                      Close {filename}
                    </MenuItem>
                  ) : null}

                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </React.Fragment>
  );
}