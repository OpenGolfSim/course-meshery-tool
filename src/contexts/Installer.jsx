import React, { useState, useRef, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import logger from 'electron-log/renderer';

const log = logger.scope('RENDERER');

// Create the context with a default value (e.g., 'light')
const InstallerContext = createContext({
  installState: null,
});

export const useInstaller = () => useContext(InstallerContext);

export const InstallerProvider = ({ children }) => {
  const [isPending, setIsPending] = useState(true);
  const [installState, setInstallState] = useState(null);


  const handleStateChange = (event, stateChange) => {
    setInstallState(stateChange);
  }

  useEffect(() => {
    window.meshery.tools.checkInstallState().then(res => {
      console.log('DALTools', res);
      setInstallState(res);
    }).catch(error => {
      setInstallState({ error });
    }).finally(() => {
      setIsPending(false);
    });

    window.meshery.on('installState', handleStateChange);
    return () => {
      window.meshery.off('installState', handleStateChange);
    }
  }, []);

  if (isPending) {
    return null;
  }
  return (
    <InstallerContext.Provider value={{ installState }}>
      {children}
    </InstallerContext.Provider>
  );
};