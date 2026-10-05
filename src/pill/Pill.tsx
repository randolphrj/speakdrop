import { useEffect, useRef, useState, type MouseEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  availableMonitors,
  getCurrentWindow,
  primaryMonitor,
  type Monitor,
} from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { VoiceWaveIndicator } from "../components/VoiceWaveIndicator";
import { buildDisplayTranscript, tailWords } from "../lib/transcript";
import {
  resolvePillPosition,
  type Point,
  type Rect,
} from "../lib/pillPosition";

const POSITION_KEY = "speakdrop.pill.position";
// Read once to carry the position over from before the SpeakDrop rename.
const LEGACY_POSITION_KEY = "gladiaflow.pill.position";
const HIDE_AFTER_PASTE_MS = 300;
// Safety net: audio-level arrives ~30x/s while capturing, so a long silence
// in events means the session ended without a paste-complete.
const IDLE_HIDE_MS = 10000;
// When audio-level stops (capture stopped), let the bars settle to rest.
const LEVEL_DECAY_MS = 150;
const CAPTION_MAX_CHARS = 28;

const readSavedPosition = (): Point | null => {
  try {
    const raw =
      localStorage.getItem(POSITION_KEY) ??
      localStorage.getItem(LEGACY_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)
      ? { x: parsed.x, y: parsed.y }
      : null;
  } catch {
    return null;
  }
};

const savePosition = (pos: Point) => {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
  } catch {
    // Position memory is a convenience; ignore storage failures.
  }
};

const workArea = (monitor: Monitor): Rect => ({
  x: monitor.workArea.position.x,
  y: monitor.workArea.position.y,
  width: monitor.workArea.size.width,
  height: monitor.workArea.size.height,
});

/** Move the pill to its saved spot, pulled back on screen if needed. */
const placeOnScreen = async () => {
  const win = getCurrentWindow();
  const [monitors, primary, size, current] = await Promise.all([
    availableMonitors(),
    primaryMonitor(),
    win.outerSize(),
    win.outerPosition(),
  ]);
  const target = resolvePillPosition(
    readSavedPosition(),
    { width: size.width, height: size.height },
    monitors.map(workArea),
    primary ? workArea(primary) : null,
  );
  if (target.x !== current.x || target.y !== current.y) {
    await win.setPosition(new PhysicalPosition(target.x, target.y));
  }
};

/**
 * Floating dictation pill. The native window is shown once at startup
 * without activation and never shown/hidden again: re-showing a window can
 * steal focus from the app being typed into and break the paste. Instead it
 * fades in and out and turns click-through while "hidden".
 */
export function Pill() {
  const [visible, setVisible] = useState(false);
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [caption, setCaption] = useState("");

  const finalRef = useRef("");
  const partialRef = useRef("");
  const listeningRef = useRef(false);
  const hideTimer = useRef<number | null>(null);
  const idleTimer = useRef<number | null>(null);
  const decayTimer = useRef<number | null>(null);

  useEffect(() => {
    const win = getCurrentWindow();
    let cancelled = false;
    let cleanups: Array<() => void> = [];

    const clearTimer = (timer: { current: number | null }) => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };

    const hide = () => {
      clearTimer(hideTimer);
      clearTimer(idleTimer);
      clearTimer(decayTimer);
      listeningRef.current = false;
      setListening(false);
      setLevel(0);
      setVisible(false);
      win.setIgnoreCursorEvents(true).catch(console.error);
    };

    const bumpIdle = () => {
      clearTimer(idleTimer);
      idleTimer.current = window.setTimeout(hide, IDLE_HIDE_MS);
    };

    const scheduleHide = () => {
      listeningRef.current = false;
      setListening(false);
      clearTimer(hideTimer);
      hideTimer.current = window.setTimeout(hide, HIDE_AFTER_PASTE_MS);
    };

    const updateCaption = () => {
      setCaption(
        tailWords(
          buildDisplayTranscript(finalRef.current, partialRef.current),
          CAPTION_MAX_CHARS,
        ),
      );
    };

    // Start click-through and in place; the window itself stays shown.
    win.setIgnoreCursorEvents(true).catch(console.error);
    placeOnScreen().catch(console.error);

    const setup = async () => {
      const unlistenReady = await listen("audio-capture-ready", () => {
        clearTimer(hideTimer);
        finalRef.current = "";
        partialRef.current = "";
        setCaption("");
        listeningRef.current = true;
        setListening(true);
        // Re-check placement each time in case displays changed.
        placeOnScreen().catch(console.error);
        setVisible(true);
        win.setIgnoreCursorEvents(false).catch(console.error);
        bumpIdle();
      });

      const unlistenLevel = await listen<number>("audio-level", (event) => {
        if (!listeningRef.current) return;
        setLevel(event.payload);
        clearTimer(decayTimer);
        decayTimer.current = window.setTimeout(
          () => setLevel(0),
          LEVEL_DECAY_MS,
        );
        bumpIdle();
      });

      const unlistenPartial = await listen<string>(
        "transcription-partial",
        (event) => {
          partialRef.current = event.payload;
          updateCaption();
          bumpIdle();
        },
      );

      const unlistenFinal = await listen<string>(
        "transcription-final",
        (event) => {
          finalRef.current = event.payload;
          partialRef.current = "";
          updateCaption();
          bumpIdle();
        },
      );

      const unlistenSessionEnded = await listen("session-ended", () => {
        listeningRef.current = false;
        setListening(false);
        bumpIdle();
      });

      const unlistenPasteComplete = await listen("paste-complete", () => {
        scheduleHide();
      });

      const unlistenError = await listen("transcription-error", () => {
        scheduleHide();
      });

      const unlistenMoved = await win.onMoved(({ payload }) => {
        savePosition({ x: payload.x, y: payload.y });
      });

      const all = [
        unlistenReady,
        unlistenLevel,
        unlistenPartial,
        unlistenFinal,
        unlistenSessionEnded,
        unlistenPasteComplete,
        unlistenError,
        unlistenMoved,
      ];
      if (cancelled) {
        all.forEach((fn) => fn());
        return;
      }
      cleanups = all;
    };

    setup();

    return () => {
      cancelled = true;
      clearTimer(hideTimer);
      clearTimer(idleTimer);
      clearTimer(decayTimer);
      cleanups.forEach((fn) => fn());
    };
  }, []);

  const startDrag = (event: MouseEvent) => {
    if (event.button !== 0) return;
    getCurrentWindow().startDragging().catch(console.error);
  };

  return (
    <div
      className={`pill ${visible ? "visible" : ""}`}
      onMouseDown={startDrag}
      aria-hidden={!visible}
    >
      <VoiceWaveIndicator isListening={listening} level={level} />
      <span className={`pill-caption ${caption ? "" : "placeholder"}`}>
        {caption || (listening ? "Listening…" : "Finishing…")}
      </span>
    </div>
  );
}
