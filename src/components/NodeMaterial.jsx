import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { WebGLNodesHandler } from 'three/examples/jsm/tsl/WebGLNodesHandler.js';

export default function NodeMaterialSetup() {
  const { gl } = useThree();
  useEffect(() => {
    gl.setNodesHandler(new WebGLNodesHandler());
  }, [gl]);
  return null;
}