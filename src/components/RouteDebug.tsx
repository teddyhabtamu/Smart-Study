import React from 'react';
import { useLocation } from 'react-router-dom';

export const RouteDebug: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  
  React.useEffect(() => {
    console.log('🔵 RouteDebug: Current location:', location.pathname);
    console.log('🔵 RouteDebug: Search:', location.search);
  }, [location]);
  
  return <>{children}</>;
};

