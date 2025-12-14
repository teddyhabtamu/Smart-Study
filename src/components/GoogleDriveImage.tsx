import React, { useState, useEffect } from 'react';
import { convertGoogleDriveImageUrl, getGoogleDriveThumbnailUrl } from '../utils/imageUtils';

interface GoogleDriveImageProps {
  src: string | undefined | null;
  alt: string;
  className?: string;
  fallbackIcon?: React.ReactNode;
  onError?: () => void;
}

/**
 * Component that handles Google Drive images with multiple fallback URL formats
 */
const GoogleDriveImage: React.FC<GoogleDriveImageProps> = ({ 
  src, 
  alt, 
  className = '', 
  fallbackIcon,
  onError 
}) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [hasError, setHasError] = useState(false);
  const [currentAttempt, setCurrentAttempt] = useState(0);

  // Extract file ID from URL
  const getFileId = (url: string): string | null => {
    if (!url || (!url.includes('drive.google.com') && !url.includes('googleusercontent.com'))) return null;
    
    // Try patterns in order of specificity
    const patterns = [
      /uc\?export=view&id=([a-zA-Z0-9_-]+)/,   // uc?export=view&id=FILE_ID
      /\/file\/d\/([a-zA-Z0-9_-]+)/,          // /file/d/FILE_ID
      /\/d\/([a-zA-Z0-9_-]+)/,                // /d/FILE_ID
      /[?&]id=([a-zA-Z0-9_-]+)/,              // ?id=FILE_ID or &id=FILE_ID
      /\/uc\?id=([a-zA-Z0-9_-]+)/             // /uc?id=FILE_ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  };

  // Try different URL formats as fallbacks
  // Note: Removed lh3.googleusercontent.com as it causes 429 rate limit errors
  const getFallbackUrl = (fileId: string, attempt: number): string => {
    switch (attempt) {
      case 0:
        // Primary: uc?export=view (most reliable)
        return `https://drive.google.com/uc?export=view&id=${fileId}`;
      case 1:
        // Fallback 1: thumbnail API with smaller size to avoid rate limits
        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w500`;
      case 2:
        // Fallback 2: alternative thumbnail format with medium size
        return getGoogleDriveThumbnailUrl(fileId, 'medium');
      default:
        return '';
    }
  };

  useEffect(() => {
    if (!src) {
      setHasError(true);
      return;
    }

    // Always use proxy endpoint which bypasses CORS
    // convertGoogleDriveImageUrl will extract file ID and convert to proxy URL
    const convertedUrl = convertGoogleDriveImageUrl(src);
    
    // Ensure we're using the proxy - if still a Google Drive URL, try to extract file ID manually
    if (convertedUrl.includes('drive.google.com') && !convertedUrl.includes('/api/documents/image-proxy/')) {
      console.warn('Image URL not converted to proxy, attempting manual conversion:', src);
      // Try to extract file ID manually and use proxy
      const fileId = getFileId(src || '');
      if (fileId) {
        const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        // Normalize: remove trailing /api if present, then add /api/documents/image-proxy
        const baseUrl = API_BASE_URL.replace(/\/api$/, '');
        setImageSrc(`${baseUrl}/api/documents/image-proxy/${fileId}`);
      } else {
        setImageSrc(convertedUrl);
      }
    } else {
      setImageSrc(convertedUrl);
    }
    
    setHasError(false);
    setCurrentAttempt(0);
  }, [src]);

  const handleImageError = () => {
    // If using proxy and it fails, the image is likely not publicly accessible
    // Show fallback icon
    setHasError(true);
    if (onError) onError();
  };

  if (hasError || !imageSrc) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 ${className}`}>
        {fallbackIcon}
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onError={handleImageError}
      loading="lazy"
    />
  );
};

export default GoogleDriveImage;
