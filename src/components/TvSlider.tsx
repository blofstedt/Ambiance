/**
 * @file D-pad operable slider + tooltip. VISUAL.
 */
import { useCallback, useRef, useState } from 'react';
import { Info } from 'lucide-react';

/**
 * WEB-23: this control had no ARIA role, no value semantics and no label
 * association, so it was invisible to accessibility services and to Android
 * TV's own focus engine. It is now a proper slider.
 *
 * BUILD-05: every prop was typed `any`.
 */
export interface TvSliderProps {
  label: string;
  tooltip?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  gradientClasses: string;
  thumbColor: string;
  /** Overrides thumb positioning for bipolar scales such as warmth. */
  thumbLeftCalc?: string;
  onChange: (value: number) => void;
  onSave?: (value: number) => void;
}

export function SettingTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center">
      <span
        tabIndex={0}
        role="note"
        aria-label={text}
        className="tv-focusable inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-canvas-gold/35 bg-canvas-gold/12 text-canvas-gold"
      >
        <Info className="h-3 w-3" aria-hidden="true" />
      </span>
      {/*
       * WEB-25: this was centred on the badge (`left-1/2 -translate-x-1/2`)
       * with a fixed `w-64`, so near a panel edge it ran off the screen — in
       * the reported screenshot it was clipped off the left. Anchored to the
       * badge's start edge and sized to its content instead, so it always opens
       * into the panel rather than out of it.
       */}
      <span
        role="tooltip"
        className="pointer-events-none absolute top-7 left-0 z-50 w-max max-w-64 rounded-lg border border-white/20 bg-black/95 px-3 py-2 text-tv-xs leading-relaxed tracking-[0.08em] text-white/85 uppercase opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

export function TvSlider(props: TvSliderProps) {
  const {
    label,
    tooltip,
    value,
    min,
    max,
    step,
    suffix = '',
    gradientClasses,
    thumbColor,
    thumbLeftCalc,
    onChange,
    onSave,
  } = props;

  const [isEditing, setIsEditing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const commit = useCallback(() => {
    setIsEditing(false);
    onSave?.(value);
  }, [onSave, value]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isEditing) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          setIsEditing(true);
        }
        return;
      }

      switch (event.key) {
        case 'Escape':
        case 'Enter':
        case 'Backspace':
          event.preventDefault();
          event.stopPropagation();
          commit();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          event.stopPropagation();
          onChange(Math.max(min, value - step));
          break;
        case 'ArrowRight':
          event.preventDefault();
          event.stopPropagation();
          onChange(Math.min(max, value + step));
          break;
        case 'Home':
          event.preventDefault();
          onChange(min);
          break;
        case 'End':
          event.preventDefault();
          onChange(max);
          break;
        case 'ArrowUp':
        case 'ArrowDown':
          // Swallow vertical movement so the D-pad cannot silently jump out of
          // a slider the user is mid-adjustment on.
          event.preventDefault();
          event.stopPropagation();
          break;
        default:
          break;
      }
    },
    [isEditing, commit, onChange, min, max, step, value],
  );

  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-tv-xs font-bold tracking-[0.25em] text-white/60 uppercase">
        <span className="flex items-center gap-2">
          {label}
          {tooltip ? <SettingTooltip text={tooltip} /> : null}
          {isEditing ? (
            <span className="ml-1 animate-pulse text-white" aria-hidden="true">
              (edit)
            </span>
          ) : null}
        </span>
        <span className="font-mono text-tv-sm text-canvas-sage">
          {value}
          {suffix}
        </span>
      </div>

      <div
        ref={containerRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={`${value}${suffix}`}
        className={[
          'tv-focusable relative flex h-6 cursor-pointer items-center rounded-full transition-all outline-none select-none',
          isEditing ? 'scale-[1.02] ring-4 ring-white' : '',
        ].join(' ')}
        onClick={() => {
          if (!isEditing) {
            setIsEditing(true);
            containerRef.current?.focus();
          }
        }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      >
        <div className={`relative h-2.5 w-full rounded-full ${gradientClasses}`}>
          <div
            className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-4 border-canvas-surface transition-all duration-200"
            style={{
              backgroundColor: thumbColor,
              left: thumbLeftCalc ?? `calc(${percent}% - 0.625rem)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
