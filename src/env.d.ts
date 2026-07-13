/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly BASEROW_DB_TOKEN: string;
  readonly S3_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}