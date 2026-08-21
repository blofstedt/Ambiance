/**
 * @file Owns the update check, the download poll and the install handoff.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useConstant } from './useConstant';

import {
  IDLE_UPDATE_STATUS,
  cancelUpdateDownload,
  canInstallPackages,
  canSelfUpdate,
  installDownloadedUpdate,
  installedVersion,
  openInstallPermissionSettings,
  readUpdateStatus,
  startUpdateDownload,
  type UpdateStatus,
} from '../lib/native';
import { buildUpdate, isUpgrade, parseRelease, type AvailableUpdate } from '../lib/updates';
import { load, save } from '../lib/storage';

/**
 * The repository releases are published from. Public information, not a secret
 * — this is the same slug that appears in the URL bar of the project page — so
 * it is safe in the bundle. Overridable at build time for a fork.
 */
const REPO = import.meta.env.VITE_UPDATE_REPO || 'blofstedt/Ambiance';

const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Once a day. GitHub allows 60 unauthenticated calls an hour per address. */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Wait for the TV's network to actually come up before the first check. */
const FIRST_CHECK_DELAY_MS = 45_000;
const POLL_STATUS_MS = 500;
const REQUEST_TIMEOUT_MS = 15_000;

export type CheckState = 'idle' | 'checking' | 'current' | 'available' | 'error';

export interface UseAppUpdateResult {
  /** False in a browser: nothing here can install an APK. */
  supported: boolean;
  installedVersionName: string;
  checkState: CheckState;
  /** Set only when checkState is 'available'. */
  update: AvailableUpdate | null;
  /** Progress of the native download, once one has been started. */
  status: UpdateStatus;
  /** True when Android has not yet been told this app may install packages. */
  needsInstallPermission: boolean;
  lastCheckedAt: number | null;
  errorMessage: string;

  check: () => void;
  download: () => void;
  install: () => void;
  cancel: () => void;
  grantInstallPermission: () => void;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    /*
     * Plain fetch, not lib/http.ts. That module exists to route SENSOR traffic
     * through the native layer to escape CORS on a plaintext LAN address; these
     * are ordinary https calls to a public API and belong on the standard path.
     */
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Checks GitHub Releases for a newer build, downloads it natively and hands it
 * to the system installer.
 *
 * Everything risky lives elsewhere on purpose: the decision of whether a build
 * is newer and whether its URL may be trusted is in lib/updates.ts (pure,
 * tested), and the download, checksum and install are in UpdateInstaller.java
 * (Android will not let a WebView install a package). This hook is only the
 * wiring between them.
 */
export function useAppUpdate(): UseAppUpdateResult {
  const supported = canSelfUpdate();
  // useConstant, not useRef(installedVersion()) — the latter crosses the JS
  // bridge on every render to build a value it then throws away.
  const installed = useConstant(installedVersion);

  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [status, setStatus] = useState<UpdateStatus>(IDLE_UPDATE_STATUS);
  const [errorMessage, setErrorMessage] = useState('');
  const [needsInstallPermission, setNeedsInstallPermission] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(() =>
    load<number | null>('lastUpdateCheck', null),
  );

  const inFlight = useRef(false);

  const check = useCallback(() => {
    if (!supported || inFlight.current) return;
    inFlight.current = true;
    setCheckState('checking');
    setErrorMessage('');

    void (async () => {
      try {
        const release = parseRelease(await fetchJson(LATEST_RELEASE_URL));
        if (!release) throw new Error('No published release yet.');

        /*
         * update.json is fetched from the release's own asset URL rather than
         * a guessed path, so a release without one degrades gracefully instead
         * of turning a missing file into a failed check.
         */
        const manifestAsset = release.assets.find((asset) => asset.name === 'update.json');
        let manifest: unknown = null;
        if (manifestAsset) {
          try {
            manifest = await fetchJson(manifestAsset.browser_download_url);
          } catch {
            manifest = null;
          }
        }

        const candidate = buildUpdate(release, manifest);
        const now = Date.now();
        setLastCheckedAt(now);
        save('lastUpdateCheck', now);

        if (candidate && isUpgrade(installed, candidate)) {
          setUpdate(candidate);
          setCheckState('available');
        } else {
          setUpdate(null);
          setCheckState('current');
        }
      } catch (error) {
        setUpdate(null);
        setCheckState('error');
        setErrorMessage(
          error instanceof Error && error.name === 'AbortError'
            ? 'The update server did not respond.'
            : 'Could not reach the update server.',
        );
      } finally {
        inFlight.current = false;
      }
    })();
  }, [supported, installed]);

  // First check well after boot, then daily. A TV is switched on and left alone.
  useEffect(() => {
    if (!supported) return;

    const first = setTimeout(check, FIRST_CHECK_DELAY_MS);
    const repeat = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(repeat);
    };
  }, [supported, check]);

  /*
   * Poll the native download only while one is actually running. An always-on
   * interval would cross the JS bridge twice a second for the life of the app.
   */
  const polling = status.state === 'downloading' || status.state === 'verifying';

  useEffect(() => {
    if (!supported || !polling) return;
    const timer = setInterval(() => setStatus(readUpdateStatus()), POLL_STATUS_MS);
    return () => clearInterval(timer);
  }, [supported, polling]);

  const download = useCallback(() => {
    if (!update) return;

    if (!canInstallPackages()) {
      // Without this grant the installer closes instantly and looks like a crash.
      setNeedsInstallPermission(true);
      return;
    }
    setNeedsInstallPermission(false);

    startUpdateDownload(update.apkUrl, update.sha256 ?? '', update.versionName);
    setStatus({ state: 'downloading', progress: 0, error: '', versionName: update.versionName });
  }, [update]);

  const install = useCallback(() => {
    installDownloadedUpdate();
    setStatus((previous) => ({ ...previous, state: 'installing' }));
  }, []);

  const cancel = useCallback(() => {
    cancelUpdateDownload();
    setStatus(IDLE_UPDATE_STATUS);
  }, []);

  const grantInstallPermission = useCallback(() => {
    openInstallPermissionSettings();
  }, []);

  return {
    supported,
    installedVersionName: installed.versionName,
    checkState,
    update,
    status,
    needsInstallPermission,
    lastCheckedAt,
    errorMessage,
    check,
    download,
    install,
    cancel,
    grantInstallPermission,
  };
}
