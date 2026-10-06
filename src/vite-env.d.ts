/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: 'api' | 'static';
  readonly VITE_API_BASE?: string;
  readonly VITE_GITHUB_REPO?: string;
}
