import React from 'react';
import { useLocation } from 'react-router-dom';

interface PublicRouteProps {
  children: React.ReactNode;
}

/**
 * Wrapper component that prevents Layout from wrapping public routes
 * This is a workaround for React Router's route matching behavior
 */
export const PublicRoute: React.FC<PublicRouteProps> = ({ children }) => {
  return <>{children}</>;
};

