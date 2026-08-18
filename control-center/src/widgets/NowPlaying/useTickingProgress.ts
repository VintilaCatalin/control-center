import { useEffect, useRef, useState } from 'react';

// The server only reports position once per poll (~2s). Without local
// interpolation the scrub bar visibly steps forward every poll instead of
// flowing - this ticks a local display value forward in real time between
// polls, and re-anchors to the server's number the moment a fresh one
// arrives (self-correcting any drift every poll instead of accumulating
// it).
export function useTickingProgress(
  position: number | undefined,
  duration: number | undefined,
  playing: boolean | undefined,
): number {
  const anchor = useRef({ position: position ?? 0, at: Date.now() });
  const [display, setDisplay] = useState(position ?? 0);

  useEffect(() => {
    anchor.current = { position: position ?? 0, at: Date.now() };
    setDisplay(position ?? 0);
  }, [position]);

  useEffect(() => {
    if (!playing || !duration) return;
    const id = setInterval(() => {
      const elapsed = (Date.now() - anchor.current.at) / 1000;
      setDisplay(Math.min(duration, anchor.current.position + elapsed));
    }, 250);
    return () => clearInterval(id);
  }, [playing, duration]);

  return display;
}
