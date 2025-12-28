import * as React from 'react';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import SVGIcon from '@mui/icons-material/Polyline';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Grow from '@mui/material/Grow';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import { useMeshery } from '../contexts/Meshery.jsx';
import { ListItemIcon } from '@mui/material';

export default function SvgImportButton({
  onImportDialogOpen
}) {
  const {
    settings,
    setSettings,
    setLayers,
    setLayerSettings,
    setInputHeightMap,
    setSystemLoading,
    setSystemError,
    clearSVG
  } = useMeshery();
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef(null);
  const filename = React.useMemo(() => {
    return settings.svgFilePath?.split('/').pop();
  }, [settings.svgFilePath]);
  // const [selectedIndex, setSelectedIndex] = React.useState(1);

  const handleClick = async () => {
    const result = await window.meshery.selectSVGFile();
    console.log('HANDLE IMPORT', result);
    if(result?.layerSettings) {
      setLayerSettings(result.layerSettings);
    }
    if (result?.path) {
      // setSystemLoading('Reading SVG file...');
      setSettings(settings => ({
        ...settings,
        palette: result.palette,
        svgFilePath: result.path,
        svgSize: result.svgSize
      }));
      // await handleSVGImported(result);
    }
    if (result?.layers?.length) {
      setLayers(result?.layers);
      onImportDialogOpen(true);
    }
  };

  const handleGlobalSettingsClick = (event) => {
    onImportDialogOpen(true);
    handleClose(event);
  }
  const handleMenuItemClick = (event) => {
    setOpen(false);
  };

  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };
  const handleCloseFile = (event) => {
    clearSVG();
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
        color={!settings.svgFilePath ? 'primary' : 'secondary'}
        ref={anchorRef}
      >
        <Button disabled={!!filename} startIcon={<SVGIcon />} onClick={handleClick}>
          {!settings.svgFilePath ? 'Import SVG' : `${filename} (${settings.svgSize[0]}x${settings.svgSize[1]})`}
        </Button>
        <Button
          size="small"
          aria-controls={open ? 'split-button-menu' : undefined}
          aria-expanded={open ? 'true' : undefined}
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
                  <MenuItem
                    disabled={!settings.svgFilePath}
                    onClick={handleGlobalSettingsClick}
                  >
                    <ListItemIcon>
                      <SettingsIcon fontSize="small" />
                    </ListItemIcon>
                    Surface Settings
                  </MenuItem>
                  {settings.svgFilePath ? (
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