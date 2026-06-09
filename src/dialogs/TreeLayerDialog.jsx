import React, { useMemo, useCallback, useRef, useState, useEffect, useImperativeHandle } from 'react';
import { Dialog, DialogTitle, DialogActions, Button, Box, Typography, Grid, Stack, TextField, ButtonGroup, IconButton, Divider } from '@mui/material';
import BrushIcon from '@mui/icons-material/Brush';
import EraseIcon from '@mui/icons-material/Delete';
import { useProject } from '../contexts/Project';
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva';
import NumberField from '../components/NumberField';
import { SIZE, positionsToMaskData } from '../utils/treeMask';
import { SidebarAccordionGroup } from '../components/Accordion';

const MAX_UNDO = 30;

// Build a full SIZE×SIZE mask array from a sparse positions Map
function generateMaskData(positions) {
  const data = new Uint8ClampedArray(SIZE * SIZE);
  for (const [i, val] of positions) {
    data[i] = val;
  }
  return data;
}

function TreeCanvas({ satelliteLayer, svgBuffer, positions, onStrokeEnd, brushSize = 5, brushValue = 255, brushOpacity = 1.0, ref }) {
  const stageRef = useRef(null);
  const containerRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const maskImageRef = useRef(null);
  const strokeDiff = useRef(new Map());
  
  const [satImage, setSatImage] = useState(null);
  const [svgImage, setSvgImage] = useState(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 800 });
  const isDrawing = useRef(false);
  const isInverted = useRef(false);
  const panStart = useRef(null);
  // const [isPanning, setIsPanning] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.style = { imageRendering: 'pixelated' };
    canvas.width = SIZE;
    canvas.height = SIZE;
    maskCanvasRef.current = canvas;
  }, []);

  useEffect(() => {
    if (!satelliteLayer?.uri) return;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = satelliteLayer.uri;
    img.onload = () => setSatImage(img);
  }, [satelliteLayer]);

  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => {
      console.log('resize', entry.contentRect);
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useImperativeHandle(ref, () => ({
    clear() {
      const ctx = maskCanvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, SIZE, SIZE);
      refreshMask();
    },
    applyDiff(diff) {
      const canvas = maskCanvasRef.current;
      const ctx = canvas.getContext('2d');
      let minX = SIZE, minY = SIZE, maxX = 0, maxY = 0;
      for (const { i } of diff) {
        const x = i % SIZE;
        const y = Math.floor(i / SIZE);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const imgData = ctx.getImageData(minX, minY, w, h);
      const data = imgData.data;
      for (const { i, oldVal } of diff) {
        const x = i % SIZE - minX;
        const y = Math.floor(i / SIZE) - minY;
        const ci = (y * w + x) * 4;
        data[ci] = oldVal;
        data[ci + 1] = oldVal;
        data[ci + 2] = oldVal;
        data[ci + 3] = oldVal > 0 ? 255 : 0;
      }
      ctx.putImageData(imgData, minX, minY);
      refreshMask();
    },
    rebuildFromPositions(posMap) {
      const canvas = maskCanvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, SIZE, SIZE);

      if (posMap.size === 0) { refreshMask(); return; }

      const { data } = positionsToMaskData(posMap, SIZE);
      console.log('data', data);
      ctx.putImageData(new ImageData(data, SIZE, SIZE), 0, 0);
      refreshMask();
    },
  }));

  const paintAt = useCallback((cx, cy) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const r = brushSize / 2;
    let v = isInverted.current ? 0 : brushValue;

    const x0 = Math.max(0, Math.floor(cx - r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(SIZE, Math.ceil(cx + r));
    const y1 = Math.min(SIZE, Math.ceil(cy + r));
    if (x1 <= x0 || y1 <= y0) return;

    const r2 = r * r;
    const imgData = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
    const data = imgData.data;
    const w = x1 - x0;

    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy > r2) continue;

        const pi = py * SIZE + px;
        const ci = ((py - y0) * w + (px - x0)) * 4;

        const existing = positions.current.get(pi) || 0;
        const blended = Math.min(255, Math.round(
          existing + (v - existing) * brushOpacity
        ));

        if (blended !== existing) {
          if (!strokeDiff.current.has(pi)) {
            strokeDiff.current.set(pi, existing);
          }
          if (blended === 0) {
            positions.current.delete(pi);
          } else {
            positions.current.set(pi, blended);
          }
          data[ci] = blended;
          data[ci + 1] = blended;
          data[ci + 2] = blended;
          data[ci + 3] = blended > 0 ? 255 : 0;
        }
      }
    }
    ctx.putImageData(imgData, x0, y0);
  }, [brushSize, brushValue, brushOpacity, positions]);

  const getCanvasPos = useCallback((e) => {
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    const scale = stage.scaleX();
    const pos = stage.position();
    return {
      x: (pointer.x - pos.x) / scale,
      y: (pointer.y - pos.y) / scale,
    };
  }, []);

  const refreshMask = useCallback(() => {
    if (maskImageRef.current) {
      maskImageRef.current.getLayer().batchDraw();
    }
  }, []);

  const handleMouseDown = (e) => {
    if (e.evt.button === 2) {
      // Start panning
      const stage = stageRef.current;
      panStart.current = {
        x: e.evt.clientX - stage.x(),
        y: e.evt.clientY - stage.y(),
      };
      return;
    }
    isDrawing.current = true;
    strokeDiff.current = new Map();
    const pos = getCanvasPos(e);
    isInverted.current = e.evt.shiftKey;
    paintAt(pos.x, pos.y);
    refreshMask();
  };

  const handleMouseMove = (e) => {
    if (panStart.current) {
      // Pan the stage
      const stage = stageRef.current;
      stage.position({
        x: e.evt.clientX - panStart.current.x,
        y: e.evt.clientY - panStart.current.y,
      });
      stage.batchDraw();
      return;
    }
    if (!isDrawing.current) return;
    const pos = getCanvasPos(e);
    paintAt(pos.x, pos.y);
    refreshMask();
  };

  const handleMouseUp = (e) => {
    if (e.evt.button === 2) {
      panStart.current = null;
      return;
    }
    if (isDrawing.current) {
      isDrawing.current = false;
      if (strokeDiff.current.size > 0) {
        const diff = Array.from(strokeDiff.current.entries()).map(
          ([i, oldVal]) => ({ i, oldVal })
        );
        onStrokeEnd(diff);
      }
    }
    isInverted.current = false;
  };

  const handleWheel = useCallback((e) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const scaleBy = 1.1;
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }, []);

  useEffect(() => {
    const blob = new Blob([svgBuffer], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      setSvgImage(img);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [svgBuffer]);

  // useEffect(() => {
  //   const down = (e) => { if (e.metaKey || e.altKey) setIsPanning(true); };
  //   const up = () => { setIsPanning(false); };
  //   window.addEventListener('keydown', down);
  //   window.addEventListener('keyup', up);
  //   return () => {
  //     window.removeEventListener('keydown', down);
  //     window.removeEventListener('keyup', up);
  //   };
  // }, []);

  useEffect(() => {
    if (initialized || !stageRef.current || stageSize.width <= 1) return;
    const padding = 40;
    const scale = Math.min(
      (stageSize.width - padding * 2) / SIZE,
      (stageSize.height - padding * 2) / SIZE,
    );
    stageRef.current.scale({ x: scale, y: scale });
    stageRef.current.position({
      x: (stageSize.width - SIZE * scale) / 2,
      y: (stageSize.height - SIZE * scale) / 2,
    });
    stageRef.current.batchDraw();
    setInitialized(true);
  }, [stageSize, initialized]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#202020',
        overflow: 'hidden'
      }}
    >
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        // draggable={isPanning}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => e.evt.preventDefault()}
      >
        <Layer>
          <Rect x={0} y={0} width={SIZE} height={SIZE} fill="white" />
          {satImage && <KonvaImage image={satImage} width={SIZE} height={SIZE} />}
          {svgImage && <KonvaImage image={svgImage} width={SIZE} height={SIZE} />}
          <KonvaImage
            ref={maskImageRef}
            image={maskCanvasRef.current}
            width={SIZE}
            height={SIZE}
            opacity={0.75}
          />
        </Layer>
      </Stage>
    </div>
  );
}

export default function TreeLayerDialog({ onClose, onSave, open, tree }) {
  const { project } = useProject();
  const [brushSize, setBrushSize] = useState(5);
  const [brushValue, setBrushValue] = useState(255);
  const [selectedTool, setSelectedTool] = useState('paint');
  const [panelExpanded, setPanelExpanded] = useState('brush');

  const [history, setHistory] = useState([]);
  const [editTree, setEditTree] = useState({});
  const positionsRef = useRef(new Map());
  const canvasRef = useRef(null);

  const viewBoxSize = useMemo(() => {
    return project.settings.distance * 1000;
  }, [project.settings.distance]);

  const satelliteLayer = useMemo(() => {
    const vals = Object.values(project.satellite || {});
    if (!vals?.length) {
      return [{ source: 'none' }];
    }
    return vals[0];
  }, [project?.satellite]);

  const handleStrokeEnd = useCallback((diff) => {
    setHistory((prev) => {
      const next = [...prev, diff];
      return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next;
    });
  }, []);

  const handleUndo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];

    if (last.type === 'clear') {
      // Restore the snapshot into positionsRef
      positionsRef.current = new Map(last.snapshot);
      canvasRef.current.rebuildFromPositions(positionsRef.current);
    } else {
      for (const { i, oldVal } of last) {
        if (oldVal === 0) {
          positionsRef.current.delete(i);
        } else {
          positionsRef.current.set(i, oldVal);
        }
      }
      canvasRef.current.applyDiff(last);
    }

    setHistory((prev) => prev.slice(0, -1));
  };

  const handleClearData = () => {
    setHistory((prev) => {
      const snapshot = new Map(positionsRef.current);
      const next = [...prev, { type: 'clear', snapshot }];
      return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next;
    });
    positionsRef.current.clear();
    canvasRef.current.clear();
  };


  const handlePaint = () => {
    setSelectedTool('paint');
    setBrushValue(255);
  }
  const handleErase = () => {
    setSelectedTool('erase');
    setBrushValue(0);
  }
  const handleRandomChange = (newValue) => {
    console.log('event', newValue);
    setEditTree(old => ({ ...old, randomSeed: newValue }));
  }

  const handleSave = useCallback(() => {
    const positions = Array.from(positionsRef.current.entries()).map(
      ([i, val]) => ({ i, val })
    );
    const treeUpdate = { ...editTree, positions };
    console.log('Saving tree layer', treeUpdate);
    onSave(treeUpdate);
  }, [editTree, onSave]);

  // const handleKeyboardDown = (e) => {
  //   console.log(e.code);
  //   // setBrushValue();
  // }
  // const handleKeyboardUp = (e) => {
  //   console.log(e.code);
  // }
  // useEffect(() => {
  //   window.addEventListener('keydown', handleKeyboardDown);
  //   window.addEventListener('keyup', handleKeyboardUp);
  //   return () => {
  //     window.removeEventListener('keydown', handleKeyboardDown);
  //     window.removeEventListener('keyup', handleKeyboardUp);
  //   }
  // }, []);
  // Load existing tree data when dialog opens
  useEffect(() => {
    if (open && tree) {
      setEditTree({
        name: tree.name,
        randomSeed: tree.randomSeed,
      });
      console.log('tree.positions', tree.positions);
      setHistory([]);
      positionsRef.current.clear();
      if (tree.positions?.length) {
        for (const { i, val } of tree.positions) {
          positionsRef.current.set(i, val);
        }
        // Defer canvas rebuild to next frame so the ref is mounted
        requestAnimationFrame(() => {
          canvasRef.current?.rebuildFromPositions(positionsRef.current);
        });
      }
    }
  }, [open]);

  return (
    <Dialog
      fullWidth
      fullScreen
      onClose={onClose}
      open={open}
      PaperProps={{
        elevation: 1,
        sx: theme => ({
          display: 'flex',
          flexDirection: 'column'
        })
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          py: 2,
          px: 3,
          alignItems: 'center',
        }}
      >
        <Typography sx={{ flex: 1 }}>
          Tree Mask
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button variant="contained" color="inherit" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="contained" color="primary" onClick={handleSave}>
            Save Changes
          </Button>
        </Stack>
      </DialogTitle>

      
      <Box
        sx={theme => ({
          display: 'flex',
          flexDirection: 'row',
          flexGrow: 1,
          flexShrink: 1,
          minWidth: 0,
          minHeight: 0,
        })}
      >
        <Box
          sx={theme => ({
            backgroundColor: theme.palette.background.paper,
            width: 220,
            flexGrow: 0,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
          })}
        >
          <Stack spacing={5} flexGrow={1} sx={{ p: 3 }}>
            {/* <ButtonGroup>
              <IconButton color={selectedTool === 'paint' ? 'primary' : 'inherit'} onClick={handlePaint}>
                <BrushIcon />
              </IconButton>
              <IconButton color={selectedTool === 'erase' ? 'primary' : 'inherit'} onClick={handleErase}>
                <EraseIcon />
              </IconButton>
            </ButtonGroup> */}


            <Box sx={{ mt: 3 }}>
              <TextField
                label="Layer Name"
                fullWidth={true}
                value={editTree.name}
                onChange={(e) => setEditTree(old => ({ ...old, name: e.target.value }))}
              />
            </Box>
            
            <Box>
              <NumberField
                fullWidth
                label="Random Seed"
                value={editTree.randomSeed}
                format={{ useGrouping: false }} 
                onChange={handleRandomChange}
                min={1}
                max={1e6}
                helperText="Change the randomness value that controls the planting"
              />
            </Box>

            <Divider />
            <Box>
              <NumberField
                fullWidth
                label="Brush Size"
                value={brushSize}
                format={{ useGrouping: false }} 
                onChange={(newVal) => setBrushSize(newVal)}
                min={1}
                max={20}
                helperText="Change the randomness value that controls the planting"
              />
            </Box>
            <Box>
              <Button onClick={handleUndo}>Undo</Button>
              <Button onClick={handleClearData}>Clear All</Button>
            </Box>

          </Stack>

          <Box sx={{ flexGrow: 0, flexShrink: 0, p: 2 }}>
            <Typography component="div" variant="caption" color="textSecondary">
              Click to paint areas where trees should be placed. CMD + drag to move around the map.
            </Typography>
            <Typography component="div" variant="caption" color="textSecondary">
              <strong>Left-click</strong> = Paint
            </Typography>
            <Typography component="div" variant="caption" color="textSecondary">
              <strong>Shift + Right-click</strong> = Tilt
            </Typography>
          </Box>

        </Box>
        <Box
          sx={theme => ({
            flex: 1,
            backgroundColor: theme.palette.grey[900]
          })}
        >
          <TreeCanvas
            ref={canvasRef}
            satelliteLayer={satelliteLayer}
            svgBuffer={project._svgBuffer}
            brushSize={brushSize}
            brushValue={brushValue}
            positions={positionsRef}
            onStrokeEnd={handleStrokeEnd}
          />
        </Box>
      </Box>
    </Dialog>
  );
}