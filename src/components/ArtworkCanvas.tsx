/**
 * @file The artwork itself: image, colour grade, grain, crossfade. VISUAL.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import grainTexture from '../assets/textures/grain.svg';
import paperTexture from '../assets/textures/paper.svg';
import type { Artwork } from '../lib/types';

export interface ArtworkCanvasProps {
  artwork: Artwork | null;
  /** 0-100 */
  luminance: number;
  /** -500..500 */
  warmth: number;
  /** 0-100 */
  grainIntensity: number;
}

export function ArtworkCanvas({ artwork, luminance, warmth, grainIntensity }: ArtworkCanvasProps) {
  const [failed, setFailed] = useState(false);

  // WEB-16: detect a dead remote image so we can say so instead of showing a
  // black rectangle and letting the user assume the app is broken.
  useEffect(() => {
    setFailed(false);
    if (!artwork) return;

    const image = new Image();
    image.onerror = () => setFailed(true);
    image.src = artwork.url;

    return () => {
      image.onerror = null;
    };
  }, [artwork?.url]);

  const overlayOpacity = luminance / 100;
  const warmColor = `rgba(255, ${Math.round(200 + (warmth / 500) * 55)}, ${Math.round(
    150 - (warmth / 500) * 100,
  )}, 0.25)`;

  return (
    <AnimatePresence mode="sync">
      <motion.div
        /*
         * WEB-08: the key was `currentArt.id`, but local media was constructed
         * with a hardcoded `id: 999` for every single image. React saw the same
         * key on every rotation, so AnimatePresence never mounted a new node and
         * the 2.5s crossfade never ran — local albums hard-cut between photos
         * while curated art faded. Keying on the URL is stable and unique.
         */
        key={artwork?.url ?? 'empty'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 2.5, ease: 'easeInOut' }}
        className="absolute inset-0 z-0"
      >
        {artwork && !failed ? (
          <div
            className="absolute inset-0 bg-cover bg-center transition-[filter] duration-1000"
            style={{
              backgroundImage: `url(${artwork.url})`,
              filter: `brightness(${(0.02 + overlayOpacity * 0.98).toFixed(3)}) contrast(1.1) sepia(0.2)`,
            }}
          >
            <div
              className="absolute inset-0 mix-blend-multiply transition-colors duration-1000"
              style={{ backgroundColor: warmColor, opacity: Math.abs(warmth) / 500 }}
            />
            {/* WEB-16: both textures are bundled rather than fetched from
                transparenttextures.com at runtime. */}
            <div
              className="pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay"
              style={{ backgroundImage: `url(${paperTexture})` }}
            />
            <div
              className="pointer-events-none absolute inset-0 mix-blend-soft-light transition-opacity duration-500"
              style={{
                backgroundImage: `url(${grainTexture})`,
                opacity: (grainIntensity / 100) * 0.8,
              }}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-canvas-ink">
            <p className="max-w-lg text-center text-tv-sm leading-relaxed tracking-[0.2em] text-white/35 uppercase">
              {artwork
                ? 'This image could not be loaded. Check your network, or switch to a local album.'
                : 'No artwork selected.'}
            </p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
