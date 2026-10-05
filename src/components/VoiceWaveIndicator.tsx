import { useEffect, useRef } from "react";

const BAR_COUNT = 16;
const MIN_HEIGHT = 3;
const IDLE_HEIGHT = 8;
const MAX_HEIGHT = 28;
// Smoothing time constants: snap up to new peaks, ease back down.
const RISE_MS = 40;
const FALL_MS = 220;

// Mirrored envelope: middle bars tallest, edges ~30% of the peak.
const BAR_WEIGHTS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const center = (BAR_COUNT - 1) / 2;
  const distance = Math.abs(i - center) / center;
  return 0.3 + 0.7 * (1 - distance * distance);
});

export function VoiceWaveIndicator({
  isListening,
  level,
}: {
  isListening: boolean;
  level: number;
}) {
  const barRefs = useRef<Array<HTMLDivElement | null>>([]);
  const targetRef = useRef(0);
  targetRef.current = isListening ? Math.min(Math.max(level, 0), 1) : 0;

  useEffect(() => {
    if (!isListening) return;

    let frame = 0;
    let smoothed = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      const target = targetRef.current;
      const tau = target > smoothed ? RISE_MS : FALL_MS;
      smoothed += (target - smoothed) * (1 - Math.exp(-dt / tau));

      barRefs.current.forEach((bar, i) => {
        if (!bar) return;
        // A gentle wobble scaled by loudness keeps the shape from looking
        // static while talking; it vanishes in silence.
        const wobble = 1 + 0.15 * smoothed * Math.sin(now / 90 + i * 1.7);
        const height =
          MIN_HEIGHT +
          (MAX_HEIGHT - MIN_HEIGHT) * smoothed * BAR_WEIGHTS[i] * wobble;
        bar.style.height = `${Math.min(height, MAX_HEIGHT)}px`;
      });
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isListening]);

  return (
    <div className="voice-wave">
      {BAR_WEIGHTS.map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            barRefs.current[i] = el;
          }}
          className={`voice-wave-bar ${isListening ? "active" : ""}`}
          style={{ height: isListening ? MIN_HEIGHT : IDLE_HEIGHT }}
        />
      ))}
    </div>
  );
}
