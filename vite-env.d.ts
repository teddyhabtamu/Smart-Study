// Fixed: Remove missing vite/client types to resolve TS error
declare module '*.css';
declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.svg';
declare module '*.gif';

declare namespace NodeJS {
  interface ProcessEnv {
    API_KEY: string;
  }
}