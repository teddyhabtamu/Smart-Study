# Vercel Deployment Checklist

1. **Build Settings**:
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`

2. **Environment Variables**:
   - `API_KEY`: Your Google Gemini API Key.

3. **Node Version**:
   - Ensure Vercel Project Settings > General > Node.js Version is set to 18.x or 20.x.

4. **Troubleshooting**:
   - If peer dependency errors occur (rare with these fixed versions), set Environment Variable: `NPM_FLAGS` = `--legacy-peer-deps`.

# Local Verification Commands

Run these in your terminal to verify the fix:

```bash
# 1. Clean install
rm -rf node_modules package-lock.json
npm install

# 2. Verify Dev Server
# Should start at http://localhost:5173 and show styled content
npm run dev

# 3. Verify Production Build
# Should create 'dist' folder with assets/index-*.css containing Tailwind styles
npm run build
```