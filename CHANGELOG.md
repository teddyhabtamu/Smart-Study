### TypeScript Configuration Fixes

1.  **Modified `tsconfig.json`**:
    *   Removed `"types": ["node"]` to resolve `TS2688: Cannot find type definition file for 'node'`.
    *   Set `"moduleResolution": "bundler"` for modern Vite compatibility.
    *   Simplified structure to a single root config (removed complex references).
    *   Added `"DOM.Iterable"` to `lib` for better React compatibility.

2.  **Created `src/vite-env.d.ts`**:
    *   Added `/// <reference types="vite/client" />`.
    *   Added a manual type declaration for `process.env`. This allows your existing code (like `process.env.API_KEY`) to compile successfully without installing the heavy `@types/node` package.

3.  **Updated `vite.config.ts`**:
    *   Ensured clean export and standard plugin setup.