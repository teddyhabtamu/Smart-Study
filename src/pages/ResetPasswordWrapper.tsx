import React from 'react';
import ResetPassword from './ResetPassword';

const ResetPasswordWrapper: React.FC = () => {
  console.log('🟡 ResetPasswordWrapper: Component called');
  
  try {
    console.log('🟡 ResetPasswordWrapper: About to render ResetPassword');
    return <ResetPassword />;
  } catch (error) {
    console.error('🟡 ResetPasswordWrapper: Error:', error);
    return <div>Error: {String(error)}</div>;
  }
};

export default ResetPasswordWrapper;

