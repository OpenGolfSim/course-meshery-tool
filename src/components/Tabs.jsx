import * as React from 'react';
import { styled } from '@mui/material/styles';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';

export const TopNavTabs = styled(Tabs)(({ theme }) => ({
  // borderBottom: '1px solid #e8e8e8',
  padding: 0,
  margin: 0,
  minHeight: 45,

  '& .MuiTabs-indicator': {
    backgroundColor: theme.palette.primary.dark,
  },
}));

export const TopNavTab = styled((props) => <Tab disableRipple {...props} />)(({ theme }) => ({
  // textTransform: 'none',
  // minWidth: 0,
  // [theme.breakpoints.up('sm')]: {
  //   minWidth: 0,
  // },
  // color: '#aa33ff',
  minHeight: 45,
  fontWeight: theme.typography.fontWeightRegular,
  // marginRight: theme.spacing(1),
  // color: 'rgba(0, 0, 0, 0.85)',
  '&:hover': {
    color: '#7b7b7b',
    opacity: 1,
  },
  '& .MuiTab-icon': {
    margin: 0,
    padding: 0
  },
  '&.Mui-selected': {
    color: theme.palette.primary.main,
    fontWeight: theme.typography.fontWeightMedium,
  },
  // '&.Mui-focusVisible': {
  //   backgroundColor: '#d1eaff',
  // },
}));