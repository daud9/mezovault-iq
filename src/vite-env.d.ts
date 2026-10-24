/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_NETWORK?: string;
  readonly VITE_MEZO_TESTNET_RPC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
