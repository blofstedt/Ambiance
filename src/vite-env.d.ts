/// <reference types="vite/client" />

/**
 * @file Build-time environment variables. Nothing secret may ever appear here.
 */

interface ImportMetaEnv {
  /**
   * `owner/repo` that over-the-air updates are fetched from.
   * Defaults to blofstedt/Ambiance; set it to publish a fork's own releases.
   *
   * BUILD-04/invariant 10: this is public information — the same slug that
   * appears in the project's own URL — which is the only reason it is allowed
   * to be a build-time variable. Anything Vite can see ships inside the APK.
   */
  readonly VITE_UPDATE_REPO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
