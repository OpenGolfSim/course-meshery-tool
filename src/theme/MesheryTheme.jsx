import * as React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';

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
    h1: {
      fontSize: 32,
    },
    h2: {
      fontSize: 24,
    },
    h3: {
      fontSize: 14,
      fontWeight: 800,
    },
    h4: {
      fontSize: 16,
    },
    h5: {
      fontSize: 14,
    },
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

export default function MesheryTheme(props) {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      {props.children}
    </ThemeProvider>
  )
}