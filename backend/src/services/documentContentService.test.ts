import { describe, it, expect } from 'vitest';

// Pure helpers in the doc-content service: Drive ID extraction and the SSRF
// allow-list. Extraction failures must fall back to metadata-only prompts,
// never fetch arbitrary hosts.
import { extractDriveFileId, isAllowedUrl } from './documentContentService';

describe('extractDriveFileId', () => {
  it('extracts from /file/d/ sharing links', () => {
    expect(extractDriveFileId('https://drive.google.com/file/d/1AbC-_xYz12/view?usp=sharing')).toBe('1AbC-_xYz12');
  });

  it('extracts from open?id= links', () => {
    expect(extractDriveFileId('https://drive.google.com/open?id=1AbC123')).toBe('1AbC123');
  });

  it('returns null for non-Drive URLs and empty input', () => {
    expect(extractDriveFileId('https://example.com/file.pdf')).toBeNull();
    expect(extractDriveFileId('')).toBeNull();
  });
});

describe('isAllowedUrl (SSRF guard)', () => {
  it('allows Google Drive hosts over https', () => {
    expect(isAllowedUrl('https://drive.google.com/uc?export=download&id=abc')).toBe(true);
    expect(isAllowedUrl('https://drive.usercontent.google.com/download?id=abc')).toBe(true);
  });

  it('rejects http, internal, and arbitrary hosts', () => {
    expect(isAllowedUrl('http://drive.google.com/uc?id=abc')).toBe(false);
    expect(isAllowedUrl('https://example.com/evil.pdf')).toBe(false);
    expect(isAllowedUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isAllowedUrl('not a url')).toBe(false);
  });
});
