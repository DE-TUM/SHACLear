import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  /** Format the (animated) number into the displayed string. */
  format: (v: number) => string;
  durationMs?: number;
}

/** Animates a number from 0 to `value` with an ease-out curve. Respects reduced-motion. */
export function CountUp({ value, format, durationMs = 450 }: Props) {
  const [display, setDisplay] = useState(value);
  const frame = useRef<number>();

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || value === 0) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(value * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value, durationMs]);

  return <>{format(display)}</>;
}
