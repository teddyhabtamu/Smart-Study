// Vercel serverless function handler
// This file should be in backend/api/index.ts for Vercel to recognize it
// Vercel will automatically compile TypeScript
import app from '../src/server';

// Export the Express app directly - Vercel can handle Express apps natively
export default app;
