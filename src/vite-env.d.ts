/// <reference types="vite/client" />

declare const __DEV_SAVE_TOKEN__: string;

declare module '*.md?raw' {
  const content: string;
  export default content;
}
