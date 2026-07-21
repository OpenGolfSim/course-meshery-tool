import React, { useRef, useState, useEffect, createContext, useContext } from 'react';
import {
  Accordion as MuiAccordion,
  AccordionDetails as MuiAccordionDetails,
  Typography,
} from "@mui/material";
import MuiAccordionSummary, {
  accordionSummaryClasses,
} from '@mui/material/AccordionSummary';
import { styled } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

// --- Sidebar container that measures available height ---

const SidebarContext = createContext(null);

export function SidebarAccordionGroup({ children, sx, ...rest }) {
  const ref = useRef(null);
  const [availableHeight, setAvailableHeight] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const totalHeight = el.clientHeight;
      const summaries = el.querySelectorAll('.MuiAccordionSummary-root');
      let headersHeight = 0;
      summaries.forEach((s) => (headersHeight += s.offsetHeight));
      setAvailableHeight(totalHeight - headersHeight);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <SidebarContext.Provider value={availableHeight}>
      <div ref={ref} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, ...sx }} {...rest}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

// --- Components (same API as before) ---

export function AccordionHeader({ children, ...rest }) {
  return (
    <Typography
      sx={{ flex: 1, alignContent: 'center' }}
      variant="h5"
      color="textSecondary"
      {...rest}
    >
      {children}
    </Typography>
  );
}

export const Accordion = styled((props) => (
  <MuiAccordion disableGutters elevation={0} square {...props} />
))(({ theme }) => ({
  border: `1px solid ${theme.palette.divider}`,
  '&:not(:last-child)': {
    borderBottom: 0,
  },
  '&::before': {
    display: 'none',
  },
  '&.Mui-expanded': {
    margin: 0,
  },
  '&.Mui-disabled': {
    opacity: 0.5, // Standard "faded" look
    backgroundColor: '#000',
    // color: 'rgba(0, 0, 0, 0.38)',
  },
}));

export const AccordionSummary = styled((props) => (
  <MuiAccordionSummary
    expandIcon={<ExpandMoreIcon sx={{ fontSize: '0.9rem' }} />}
    {...props}
  />
))(({ theme }) => ({
  backgroundColor: 'rgba(0, 0, 0, .03)',
  flexDirection: 'row-reverse',
  [`& .${accordionSummaryClasses.expandIconWrapper}.${accordionSummaryClasses.expanded}`]:
    {},
  [`& .${accordionSummaryClasses.content}`]: {
    marginLeft: theme.spacing(1),
  },
  ...theme.applyStyles('dark', {
    backgroundColor: 'rgba(255, 255, 255, .05)',
  }),
}));

export const AccordionDetails = styled((props) => {
  const availableHeight = useContext(SidebarContext);

  return (
    <MuiAccordionDetails
      {...props}
      style={{
        maxHeight: availableHeight ?? undefined,
        ...props.style,
      }}
    />
  );
})(({ theme }) => ({
  padding: theme.spacing(0),
  borderTop: '1px solid rgba(0, 0, 0, .125)',
  overflowY: 'auto',
}));