/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly BASEROW_DB_TOKEN: string;
  readonly GITLAB_REPO_USERNAME: string;
  readonly GITLAB_REPO_NAME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}