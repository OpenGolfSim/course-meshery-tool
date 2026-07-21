import React, { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
import { Box, styled, Tab, Tabs } from "@mui/material";
export const MiniTabs = styled(props => <Tabs {...props} />)(theme => ({
  height: 32,
  minHeight: 32,
  // Adjusts the overall container height
  "&.MuiTabs-root": { minHeight: 32, height: 32 },
  // Adjusts the individual tab clickable area
  "& .MuiTab-root": { minHeight: 32, height: 32 },
}));

export const MiniTab = styled(props => <Tab disableRipple {...props} />)(theme => ({
  // padding: '1px 3px',
  // minHeight: 32,
  // '& .MuiTabs-root': {
  //   minHeight: 32,
  //   height: 32,
  // }
}));

export function MiniTabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`mini-tabpanel-${index}`}
      aria-labelledby={`mini-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}