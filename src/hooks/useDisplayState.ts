/**
 * @file Owns brightness/warmth, sleep blanking and OLED dimming.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MotionWindow } from '../lib/motion';
import {
  Ema,
  LUX_BUCKET_SIZE,
  TEMP_BUCKET_SIZE,
  bucketKey,
  bucketWithHysteresis,
  clampLuminance,
  clampWarmth,
  innateProfile,
} from '../lib/profile';
import { load, save } from '../lib/storage';
import type { RoomProfile, Telemetry } from '../lib/types';
import type { Settings } from '../lib/settings';

export interface UseDisplayStateOptions {
  telemetry: Telemetry;
  settings: Settings;
  /** Auto-profile application is suspended while the settings menu is open. */
  settingsOpen: boolean;
  connected: boolean;
}

export interface UseDisplayStateResult {
  luminance: number;
  warmth: number;
  setLuminance: (value: number) => void;
  setWarmth: (value: number) => void;
  commitProfile: () => void;
  isScreenBlack: boolean;
  isOledDimmed: boolean;
  profileKey: string;
  hasLearnedProfile: boolean;
}

export function useDisplayState(options: UseDisplayStateOptions): UseDisplayStateResult {
  const { telemetry, settings, settingsOpen, connected } = options;

  const [profiles, setProfiles] = useState<Record<string, RoomProfile>>(() =>
    load<Record<string, RoomProfile>>('profiles', {}),
  );
  const [luminance, setLuminanceState] = useState(60);
  const [warmth, setWarmthState] = useState(200);
  const [isScreenBlack, setIsScreenBlack] = useState(false);
  const [isOledDimmed, setIsOledDimmed] = useState(false);

  /* ------------------------------------------------------ smoothed telemetry */

  /**
   * WEB-12: raw lux from a TCS34725 jitters by a few units even in a perfectly
   * still room. Bucketing the raw value meant crossing a bucket boundary every
   * few seconds, and each crossing hard-reset the brightness and warmth
   * sliders from the stored profile — including mid-drag, so the control
   * visibly jumped out from under the user.
   */
  const luxEma = useRef(new Ema(0.12));
  const tempEma = useRef(new Ema(0.12));
  const [smoothed, setSmoothed] = useState({ lux: 0, temp: 0 });

  useEffect(() => {
    if (!connected) return;
    const lux = luxEma.current.push(telemetry.lux);
    const temp = tempEma.current.push(telemetry.temp);
    setSmoothed({ lux, temp });
  }, [telemetry.lux, telemetry.temp, connected]);

  const luxBucketRef = useRef<number | null>(null);
  const tempBucketRef = useRef<number | null>(null);

  const profileKey = useMemo(() => {
    const luxBucket = bucketWithHysteresis(smoothed.lux, LUX_BUCKET_SIZE, luxBucketRef.current);
    const tempBucket = bucketWithHysteresis(smoothed.temp, TEMP_BUCKET_SIZE, tempBucketRef.current);
    luxBucketRef.current = luxBucket;
    tempBucketRef.current = tempBucket;
    return bucketKey(luxBucket, tempBucket);
  }, [smoothed.lux, smoothed.temp]);

  /* ------------------------------------------------------------ auto profile */

  useEffect(() => {
    // WEB-12 (3rd guard): never move the sliders while the user is looking at
    // them. Without a sensor there is nothing to react to either.
    if (settingsOpen || !connected) return;

    const learned = profiles[profileKey];
    if (learned) {
      setLuminanceState(clampLuminance(learned.luminance));
      setWarmthState(clampWarmth(learned.warmth));
      return;
    }
    const innate = innateProfile(smoothed.lux, smoothed.temp);
    setLuminanceState(innate.luminance);
    setWarmthState(innate.warmth);
  }, [profileKey, profiles, settingsOpen, connected, smoothed.lux, smoothed.temp]);

  const setLuminance = useCallback((value: number) => setLuminanceState(clampLuminance(value)), []);
  const setWarmth = useCallback((value: number) => setWarmthState(clampWarmth(value)), []);

  /** Persists the current slider values as the profile for this light bucket. */
  const commitProfile = useCallback(() => {
    setProfiles((previous) => {
      const next = { ...previous, [profileKey]: { luminance, warmth } };
      save('profiles', next);
      return next;
    });
  }, [profileKey, luminance, warmth]);

  /* ------------------------------------------------------------ motion/sleep */

  const motionWindow = useRef(new MotionWindow(settings.motionSensitivity));
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    motionWindow.current.resize(settings.motionSensitivity);
  }, [settings.motionSensitivity]);

  const clearSleepTimer = useCallback(() => {
    if (sleepTimer.current !== null) {
      clearTimeout(sleepTimer.current);
      /*
       * WEB-06: the original cleared this timeout but never reset the ref to
       * null. The scheduling branch was guarded by `!motionTimerRef.current`,
       * which stayed truthy forever after the first sleep cycle, so the screen
       * could never go to sleep a second time in one session. Nulling here is
       * the entire fix.
       */
      sleepTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!connected) {
      // No sensor: don't blank the screen on the strength of fabricated motion.
      motionWindow.current.clear();
      clearSleepTimer();
      setIsScreenBlack(false);
      return;
    }

    motionWindow.current.push(telemetry.motion);

    // Black Mode: below the lux threshold the panel stays black regardless of
    // motion, so a dark room never gets a glowing rectangle in it.
    if (settings.blackModeEnabled && telemetry.lux <= settings.blackModeThreshold) {
      clearSleepTimer();
      setIsScreenBlack(true);
      return;
    }

    if (motionWindow.current.isSustainedMotion) {
      clearSleepTimer();
      setIsScreenBlack(false);
      return;
    }

    if (motionWindow.current.isSustainedStill && !isScreenBlack && sleepTimer.current === null) {
      sleepTimer.current = setTimeout(
        () => {
          setIsScreenBlack(true);
          sleepTimer.current = null;
        },
        Math.max(1, settings.powerSafeMinutes) * 60_000,
      );
    }
  }, [
    telemetry.motion,
    telemetry.lux,
    connected,
    isScreenBlack,
    settings.blackModeEnabled,
    settings.blackModeThreshold,
    settings.powerSafeMinutes,
    clearSleepTimer,
  ]);

  useEffect(() => clearSleepTimer, [clearSleepTimer]);

  /* ---------------------------------------------------------------- OLED dim */

  useEffect(() => {
    if (settingsOpen || (connected && telemetry.motion)) {
      setIsOledDimmed(false);
      return;
    }
    const timer = setTimeout(
      () => setIsOledDimmed(true),
      Math.max(1, settings.oledSaverMinutes) * 60_000,
    );
    return () => clearTimeout(timer);
  }, [telemetry.motion, settings.oledSaverMinutes, settingsOpen, connected]);

  return {
    luminance,
    warmth,
    setLuminance,
    setWarmth,
    commitProfile,
    isScreenBlack,
    isOledDimmed,
    profileKey,
    hasLearnedProfile: profileKey in profiles,
  };
}
