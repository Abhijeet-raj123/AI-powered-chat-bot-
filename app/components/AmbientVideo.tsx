'use client';

import { useState } from 'react';

/**
 * Optional looped background video. Add `public/ambient-bg.mp4` (short, muted loop).
 * If the file is missing, this unmounts and CSS motion backdrop remains.
 */
export function AmbientVideo() {
  const [show, setShow] = useState(true);

  if (!show) return null;

  return (
    <video
      className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.22] mix-blend-soft-light"
      autoPlay
      muted
      loop
      playsInline
      aria-hidden
      onError={() => setShow(false)}
    >
      <source src="/ambient-bg.mp4" type="video/mp4" />
    </video>
  );
}
