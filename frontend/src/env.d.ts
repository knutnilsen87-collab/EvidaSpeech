/// <reference types="vite/client" />

declare const __BUILD_COMMIT__: string;
declare const __BUILD_DIRTY__: boolean;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_NSB_ENGINE_URL?: string;
}
