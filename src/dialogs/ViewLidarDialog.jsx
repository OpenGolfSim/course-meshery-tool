import React, { Fragment, useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, CircularProgress, Grid, FormGroup, FormControlLabel, Checkbox } from '@mui/material';
import { useProject } from '../contexts/Project';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Shape, Grid as ThreeGrid, Line, Bounds, useBounds, CameraControls } from '@react-three/drei';
import PointCloud, { CLASSIFICATION_CODES } from '../components/PointCloud.jsx';


export default function ViewLidarDialog(props) {
  const { onClose, open } = props;
  const { project } = useProject();
  const controlsRef = useRef();
  const [arrayBuffer, setArrayBuffer] = useState();
  
  const viewBoxSize = useMemo(() => {
    return project.settings.distance * 1000;
  }, [project.settings.distance]);

  const handleSave = useCallback(() => {
    props.onClose();
  }, []);

  async function loadData() {
    // Load and parse the LAZ file
    // 1. Manually fetch the data using your custom protocol
    // This returns a standard Response object
    const data = await window.meshery.lidar.readOpenFile(); 
    console.log('data', data);
    setArrayBuffer(data);
  }
  
  useEffect(() => {
    if (!props.open) {
      return;
    }
    loadData();
  }, [props.open, project.lidar]);

  return (
    <Dialog
      fullWidth={true}
      fullScreen={true}
      onClose={onClose}
      open={open}
    >
      <DialogTitle>
        Elevation Data
      </DialogTitle>
      <Box sx={{ flex: 1 }}>
        <Grid container={true} sx={{ flex: 1, height: '100%' }}>
          <Grid size={3} sx={{ p: 2 }}>
            <FormGroup>
              {CLASSIFICATION_CODES.map(cls => (
                <FormControlLabel key={cls.code} control={<Checkbox size="small" />} label={cls.label} />
              ))}
            </FormGroup>
          </Grid>
          <Grid size={9} sx={{ flex: 1 }}>

            <Canvas camera={{ fov: 50, near: 1, far: 3000, position: [0, 300, 0] }}>
              <CameraControls ref={controlsRef} />
              <ambientLight intensity={Math.PI / 2} />
              <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} decay={0} intensity={Math.PI} />
              <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} />
              <boxGeometry args={[2, 2, 2]} />

              <ThreeGrid
                cellSize={10}
                sectionSize={100}
                infiniteGrid={true}
                fadeDistance={1500}
                sectionThickness={2}
                sectionColor={0x444444}
              />

              <React.Suspense fallback={null}>
                {/* Rotate -90 on X if your LAZ data is Z-up */}
                <group rotation={[-Math.PI / 2, 0, 0]}>
                  <PointCloud arrayBuffer={arrayBuffer} viewBoxSize={viewBoxSize} />
                </group>
              </React.Suspense>          
              
              <Line
                points={[
                  [0,0,0],
                  [viewBoxSize,0,0],
                  [viewBoxSize,0,viewBoxSize],
                  [0,0,viewBoxSize],
                  [0,0,0],
                ]}
                lineWidth={4}
                color={0x00ffaa}
                position={[-(viewBoxSize/2), 0, -(viewBoxSize/2)]}
              />
    

            </Canvas>

          </Grid>
        </Grid>
        


      </Box>
      <DialogActions sx={{ display: 'flex', flexDirection: 'row' }}>
        <Button
          fullWidth
          variant="text"
          color="inherit"
          onClick={handleSave}
        >
          Cancel
        </Button>
        <Button
          fullWidth
          variant="contained"
          color="primary"
          onClick={handleSave}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
 
}