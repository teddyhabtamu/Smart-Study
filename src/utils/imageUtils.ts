/**
 * Converts Google Drive sharing URLs to direct image URLs that can be used in <img> tags
 * Handles various Google Drive URL formats including URLs with query parameters
 */
export const convertGoogleDriveImageUrl = (url: string | undefined | null): string => {
  if (!url) return '';
  
  // If it's not a Google Drive URL, return as is
  if (!url.includes('drive.google.com') && !url.includes('googleusercontent.com')) {
    return url;
  }

  // Extract file ID from various Google Drive URL formats:
  // - https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  // - https://drive.google.com/file/d/FILE_ID/view
  // - https://drive.google.com/open?id=FILE_ID
  // - https://drive.google.com/d/FILE_ID/
  // - https://drive.google.com/uc?id=FILE_ID
  // - https://drive.google.com/uc?export=view&id=FILE_ID (already converted format)
  let fileId: string | null = null;
  
  // Extract file ID from various Google Drive URL formats
  // Try patterns in order of specificity (most specific first)
  const patterns = [
    /uc\?export=view&id=([a-zA-Z0-9_-]+)/,     // uc?export=view&id=FILE_ID (matches anywhere in URL)
    /\/file\/d\/([a-zA-Z0-9_-]+)/,            // /file/d/FILE_ID (handles /view, /view?usp=sharing, etc.)
    /\/d\/([a-zA-Z0-9_-]+)/,                  // /d/FILE_ID
    /[?&]id=([a-zA-Z0-9_-]+)/,                // ?id=FILE_ID or &id=FILE_ID (catches any id= parameter)
    /\/uc\?id=([a-zA-Z0-9_-]+)/               // /uc?id=FILE_ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      fileId = match[1];
      // Stop at first match to avoid conflicts
      break;
    }
  }
  
  // Debug logging
  if (url.includes('drive.google.com') && !fileId) {
    console.warn('Failed to extract file ID from Google Drive URL:', url);
  }

  if (fileId) {
    // Always use backend proxy endpoint to bypass CORS issues
    // The proxy fetches the image from Google Drive and serves it
    // Match the pattern used in api.ts: API_BASE_URL + endpoint
    // In api.ts: API_BASE_URL = 'http://localhost:5000' and endpoints = '/documents'
    // But routes are mounted at '/api/documents', so API_BASE_URL might be 'http://localhost:5000/api'
    // Check the actual API_BASE_URL from api.ts to match the pattern
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    
    // Normalize: remove trailing /api if present, then add /api/documents/image-proxy
    const baseUrl = API_BASE_URL.replace(/\/api$/, '');
    return `${baseUrl}/api/documents/image-proxy/${fileId}`;
  }

  // If we can't extract file ID, return original URL (might be a different format)
  console.warn('Could not extract Google Drive file ID from URL:', url);
  return url;
};

/**
 * Alternative Google Drive image URL formats for fallback
 */
export const getGoogleDriveThumbnailUrl = (fileId: string, size: 'small' | 'medium' | 'large' = 'large'): string => {
  const sizeMap = {
    small: 'w200',
    medium: 'w500',
    large: 'w1000'
  };
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=${sizeMap[size]}`;
};
