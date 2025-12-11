import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
}

const LoadingButton: React.FC<LoadingButtonProps> = ({
  isLoading = false,
  loadingText,
  children,
  variant = 'primary',
  disabled,
  className = '',
  ...props
}) => {
  const baseClasses = 'inline-flex items-center justify-center gap-2 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantClasses = {
    primary: 'bg-zinc-900 text-white hover:bg-zinc-800 rounded-lg',
    secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 rounded-lg',
    danger: 'bg-red-600 text-white hover:bg-red-700 rounded-lg',
    outline: 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 rounded-lg'
  };

  const combinedClassName = `${baseClasses} ${variantClasses[variant]} ${className}`;

  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      className={combinedClassName}
    >
      {isLoading && (
        <Loader2 className="w-4 h-4 animate-spin" />
      )}
      {isLoading && loadingText ? loadingText : children}
    </button>
  );
};

export default LoadingButton;

