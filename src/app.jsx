import * as React from 'react';
import { createRoot } from 'react-dom/client';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Workarea from './components/Workarea.jsx';
import { MesheryProvider } from './contexts/Meshery.jsx';

const palette = {
  mode: 'dark',
  primary: {
    main: '#11cc44'
  },
  secondary: {
    main: '#303030'
  },
  background: {
    paper: '#0a0a0a'
  }
};

const darkTheme = createTheme({
  palette,
  typography: {
    fontSize: 11,
    h5: {
      fontSize: 10,
      fontWeight: 800,
      textTransform: 'uppercase'
    },
    h6: {
      fontSize: 11,
      color: 'text.secondary'
    },
    button: {
      textTransform: 'none',
      fontSize: 12,
      fontWeight: 800
    }
  },
  spacing: 5,
  shape: {
    borderRadius: 3
  }
});

const root = createRoot(document.body);
root.render(
  <ThemeProvider theme={darkTheme}>
    <CssBaseline />
    <MesheryProvider>
      <Workarea />
    </MesheryProvider>
  </ThemeProvider>
);