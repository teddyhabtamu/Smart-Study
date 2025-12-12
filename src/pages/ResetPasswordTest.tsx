import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

console.log('🟡 ResetPasswordTest: Module loaded');

const ResetPasswordTest: React.FC = () => {
  const location = useLocation();
  
  console.log('🟡🟡🟡 ResetPasswordTest: Component FUNCTION CALLED!');
  console.log('🟡 ResetPasswordTest: Location:', location);
  
  useEffect(() => {
    console.log('🟡 ResetPasswordTest: useEffect called - component mounted!');
    console.log('🟡 ResetPasswordTest: Current URL:', window.location.href);
    
    // Prevent any redirects
    return () => {
      console.log('🟡 ResetPasswordTest: Component unmounting');
    };
  }, []);
  
  try {
    console.log('🟡 ResetPasswordTest: About to return JSX');
    const token = new URLSearchParams(location.search).get('token');
    
    return (
      <div style={{ padding: '20px', backgroundColor: 'yellow', minHeight: '100vh', zIndex: 9999, position: 'relative' }}>
        <h1>Reset Password Test Page</h1>
        <p>If you see this, the route is working!</p>
        <p>URL: {window.location.href}</p>
        <p>Pathname: {location.pathname}</p>
        <p>Search: {location.search}</p>
        <p>Token: {token || 'No token'}</p>
        <p style={{ color: 'red', fontWeight: 'bold' }}>This page should NOT redirect!</p>
      </div>
    );
  } catch (error) {
    console.error('🟡 ResetPasswordTest: Error in render:', error);
    return <div style={{ padding: '20px', backgroundColor: 'red', color: 'white' }}>Error: {String(error)}</div>;
  }
};

console.log('🟡 ResetPasswordTest: Component defined');

export default ResetPasswordTest;

