/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface ImportMetaEnv {
  readonly CHATLOGS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface CloudflareEnv {
  DB: D1Database;
}

declare module 'cloudflare:workers' {
  export const env: CloudflareEnv;
}
