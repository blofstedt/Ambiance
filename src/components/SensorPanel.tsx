/**
 * @file Settings > Sensors: discovery, pairing, passwords, telemetry. VISUAL.
 */

import { useCallback, useState } from 'react';
import { KeyRound, Loader2, Plus, RefreshCw } from 'lucide-react';

import { SettingTooltip } from './TvSlider';
import { SensorListItem } from './sensor/SensorListItem';
import { TelemetryReadout } from './sensor/TelemetryReadout';
import { BUTTON, FIELD, SECTION_HEADING, cx } from './ui/styles';
import { describeOutcome } from '../lib/sensor';
import {
  DEFAULT_ADMIN_USER,
  MIN_ADMIN_PASSWORD_LENGTH,
  SETUP_PORTAL_SSID,
  displayName,
} from '../lib/sensor-utils';
import type { DialogRequest } from './Dialog';
import type { ConnectionState, SensorCallOutcome, SensorInfo, Telemetry } from '../lib/types';

export interface SensorPanelProps {
  sensors: Record<string, SensorInfo>;
  selectedSensorId: string;
  telemetry: Telemetry;
  connection: ConnectionState;
  isScanning: boolean;
  pendingRenames: Record<string, string>;
  hasCredentials: boolean;

  onRescan: () => void;
  onSelect: (id: string) => void;
  onForget: (id: string) => void;
  onRename: (id: string, name: string) => Promise<SensorCallOutcome>;
  onPair: (id: string) => Promise<SensorCallOutcome>;
  onAddManual: (address: string) => Promise<SensorCallOutcome>;
  onSetCredentials: (user: string, password: string) => void;
  onChangePassword: (id: string, password: string) => Promise<SensorCallOutcome>;
  showDialog: (request: DialogRequest) => void;
}

export function SensorPanel(props: SensorPanelProps) {
  const {
    sensors,
    selectedSensorId,
    telemetry,
    connection,
    isScanning,
    pendingRenames,
    hasCredentials,
    onRescan,
    onSelect,
    onForget,
    onRename,
    onPair,
    onAddManual,
    onSetCredentials,
    onChangePassword,
    showDialog,
  } = props;

  const [manualAddress, setManualAddress] = useState('');
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  /**
   * WEB-02: every write endpoint needs HTTP Basic auth, and the old client sent
   * none — renames queued forever and pairing reported "unreachable". This is
   * where credentials are captured.
   */
  const promptForCredentials = useCallback(() => {
    showDialog({
      title: 'Sensor admin password',
      message:
        'Enter the admin password for your ambient sensor. The factory default is "changeme", ' +
        'and the sensor will refuse to pair until you replace it.',
      input: {
        type: 'password',
        placeholder: 'Admin password',
        submitLabel: 'Save password',
        onSubmit: (value) => {
          const password = value.trim();
          if (password) onSetCredentials(DEFAULT_ADMIN_USER, password);
        },
      },
    });
  }, [showDialog, onSetCredentials]);

  /**
   * WEB-03: the firmware returns 428 for sensitive writes while the factory
   * password stands. The old UI showed a flat "could not pair", which is
   * actively misleading — the sensor was working and asking to be secured.
   */
  const promptForNewPassword = useCallback(
    (sensorId: string) => {
      showDialog({
        title: 'Set a new sensor password',
        message:
          'This sensor still has its factory password, so it will not accept pairing. ' +
          `Choose a new password of at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`,
        input: {
          type: 'password',
          placeholder: `New password (min ${MIN_ADMIN_PASSWORD_LENGTH} characters)`,
          submitLabel: 'Update password',
          onSubmit: (value) => {
            const password = value.trim();
            if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
              showDialog({
                title: 'Password too short',
                message: `The sensor requires at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`,
              });
              return;
            }
            void (async () => {
              const outcome = await onChangePassword(sensorId, password);
              showDialog({ title: 'Sensor password', message: describeOutcome(outcome) });
            })();
          },
        },
      });
    },
    [showDialog, onChangePassword],
  );

  /** Routes a failed call to the action that actually resolves it. */
  const handleOutcome = useCallback(
    (sensorId: string, title: string, outcome: SensorCallOutcome) => {
      if (outcome === 'unauthorized') {
        promptForCredentials();
        return;
      }
      if (outcome === 'password_change_required') {
        promptForNewPassword(sensorId);
        return;
      }
      if (outcome !== 'ok') {
        showDialog({ title, message: describeOutcome(outcome) });
      }
    },
    [promptForCredentials, promptForNewPassword, showDialog],
  );

  /** Wraps an async action with the busy flag so buttons cannot double-fire. */
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }, []);

  const pairSensorById = useCallback(
    (sensorId: string) =>
      run(async () => {
        const outcome = await onPair(sensorId);
        handleOutcome(sensorId, 'Pairing', outcome);
      }),
    [run, onPair, handleOutcome],
  );

  const renameSensorById = useCallback(
    (sensorId: string) =>
      run(async () => {
        const draft = renameDrafts[sensorId];
        if (draft === undefined || !draft.trim()) return;
        const outcome = await onRename(sensorId, draft);
        if (outcome === 'unreachable') {
          showDialog({
            title: 'Rename queued',
            message: 'The sensor is offline. The new name will be applied next time it responds.',
          });
          return;
        }
        handleOutcome(sensorId, 'Rename', outcome);
      }),
    [run, renameDrafts, onRename, showDialog, handleOutcome],
  );

  const addManual = useCallback(
    () =>
      run(async () => {
        const address = manualAddress.trim();
        if (!address) return;
        const outcome = await onAddManual(address);
        if (outcome === 'ok') {
          setManualAddress('');
          showDialog({ title: 'Sensor paired', message: 'The sensor is now paired to this TV.' });
          return;
        }
        handleOutcome('', 'Add sensor', outcome);
      }),
    [run, manualAddress, onAddManual, showDialog, handleOutcome],
  );

  const selectSensor = useCallback(
    (id: string, sensor: SensorInfo) => {
      if (id === selectedSensorId) return;

      if (sensor.pairedTvId) {
        showDialog({
          title: 'Sensor paired elsewhere',
          message: 'This sensor is currently paired to another TV. Switch it to this one?',
          actions: [
            { label: 'Cancel' },
            { label: 'Switch', variant: 'primary', onSelect: () => void pairSensorById(id) },
          ],
        });
        return;
      }

      onSelect(id);
      void pairSensorById(id);
    },
    [selectedSensorId, showDialog, pairSensorById, onSelect],
  );

  const confirmForget = useCallback(
    (id: string, sensor: SensorInfo) => {
      showDialog({
        title: 'Forget sensor',
        message: `Remove ${displayName(sensor.name)} from this TV? The sensor itself is not changed.`,
        actions: [
          { label: 'Cancel' },
          { label: 'Forget', variant: 'danger', onSelect: () => onForget(id) },
        ],
      });
    },
    [showDialog, onForget],
  );

  const entries = Object.entries(sensors);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <h3 className={cx(SECTION_HEADING, 'border-0 pb-0')}>
          Sensors &amp; Telemetry
          <SettingTooltip text="Find ambient sensors, choose the active one, and view live readings." />
        </h3>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={promptForCredentials}
            className={cx(BUTTON, 'flex items-center gap-2')}
            title="Set the sensor admin password used for pairing and renaming."
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            {hasCredentials ? 'Password set' : 'Set password'}
          </button>

          <button
            type="button"
            onClick={onRescan}
            disabled={isScanning}
            className={cx(BUTTON, 'flex items-center gap-2 disabled:opacity-50')}
          >
            {isScanning ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {isScanning ? 'Scanning…' : 'Rescan'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="tv-scroll max-h-[38vh] rounded-xl bg-white/5 p-5">
          {entries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-tv-sm font-bold text-canvas-gold uppercase">No sensors found</p>
              <p className="max-w-md text-tv-xs leading-relaxed text-white/50">
                Power on your ambient sensor, then connect a phone to the
                <span className="text-canvas-sage"> “{SETUP_PORTAL_SSID}” </span>
                Wi-Fi network to put it on your home network. Or enter its address below.
              </p>
            </div>
          ) : (
            entries.map(([id, sensor]) => (
              <SensorListItem
                key={id}
                sensor={sensor}
                isActive={id === selectedSensorId}
                isBusy={busy}
                renameDraft={renameDrafts[id] ?? displayName(sensor.name)}
                hasPendingRename={Boolean(pendingRenames[id])}
                onRenameDraftChange={(value) =>
                  setRenameDrafts((previous) => ({ ...previous, [id]: value }))
                }
                onSelect={() => selectSensor(id, sensor)}
                onRename={() => void renameSensorById(id)}
                onForget={() => confirmForget(id, sensor)}
                onSecure={() => promptForNewPassword(id)}
              />
            ))
          )}

          <div className="mt-4 flex items-center gap-3">
            <input
              type="text"
              value={manualAddress}
              placeholder="Manual address, e.g. 192.168.1.50"
              aria-label="Add sensor by address"
              onChange={(event) => setManualAddress(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void addManual();
                }
              }}
              className={FIELD}
            />
            <button
              type="button"
              disabled={busy || !manualAddress.trim()}
              onClick={() => void addManual()}
              className={cx(BUTTON, 'flex shrink-0 items-center gap-2 disabled:opacity-40')}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add
            </button>
          </div>
        </div>

        <TelemetryReadout telemetry={telemetry} connection={connection} />
      </div>
    </section>
  );
}
