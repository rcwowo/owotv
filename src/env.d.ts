/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    CHATLOGS: R2Bucket;
    ADMIN_API_KEYS?: string;
    READ_API_KEYS?: string;
    SITE_URL?: string;
  }
}
