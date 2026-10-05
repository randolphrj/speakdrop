import type { DictationSummary, WeekDay } from "../lib/dictationStats";
import { ApiKeyField } from "./ApiKeyField";
import { VoiceWaveIndicator } from "./VoiceWaveIndicator";
import { FinalizingSpinner } from "./FinalizingSpinner";

export function HomeView({
  isRecording,
  audioLevel,
  isProcessing,
  homeTitle,
  homeSubtitle,
  dictationSummary,
  formattedTotalTime,
  funnyDictationComment,
  apiKeyDisplayValue,
  isApiKeyLocked,
  hasSavedApiKey,
  isTestingApiKey,
  onChangeApiKey,
  onSaveApiKey,
  permissions,
  isMac,
  onRecheck,
  onStopDictation,
  errorMessage,
  onOpenLogs,
  onDismissError,
}: {
  isRecording: boolean;
  audioLevel: number;
  isProcessing: boolean;
  homeTitle: string;
  homeSubtitle: string | null;
  dictationSummary: DictationSummary;
  formattedTotalTime: string;
  funnyDictationComment: string;
  apiKeyDisplayValue: string;
  isApiKeyLocked: boolean;
  hasSavedApiKey: boolean;
  isTestingApiKey: boolean;
  onChangeApiKey: (v: string) => void;
  onSaveApiKey: () => void;
  permissions: { hotkeyError: string | null };
  isMac: boolean;
  onRecheck: () => void;
  onStopDictation: () => void;
  errorMessage: string | null;
  onOpenLogs: () => void;
  onDismissError: () => void;
}) {
  return (
    <div className="setup-step setup-step-center setup-step-home">
      {(isRecording || isProcessing) && (
        <div
          className={`ready-icon ${isRecording ? "recording" : ""} ${isProcessing ? "processing" : ""}`}
        >
          {isRecording ? (
            <VoiceWaveIndicator
              isListening={isRecording}
              level={audioLevel}
            />
          ) : (
            <FinalizingSpinner />
          )}
        </div>
      )}

      <h2
        className={`setup-title ${isRecording ? "setup-title-listening" : ""}`}
      >
        {homeTitle}
      </h2>

      {homeSubtitle && <p className="setup-desc">{homeSubtitle}</p>}

      {hasSavedApiKey && (
        <div className="dictation-stats-card">
          <h3 className="dictation-stats-title">Dictation stats</h3>
          <div className="dictation-stats-grid">
            <div className="dictation-stat">
              <span className="dictation-stat-label">Current streak</span>
              <strong className="dictation-stat-value">
                {dictationSummary.currentStreak}{" "}
                {dictationSummary.currentStreak === 1 ? "day" : "days"}
              </strong>
              <span className="dictation-stat-detail">
                Best {dictationSummary.longestStreak}
              </span>
            </div>
            <div className="dictation-stat">
              <span className="dictation-stat-label">Words / min</span>
              <strong className="dictation-stat-value">
                {dictationSummary.wordsPerMinute === null
                  ? "–"
                  : Math.round(dictationSummary.wordsPerMinute)}
              </strong>
              <span className="dictation-stat-detail">
                {dictationSummary.lastWordsPerMinute === null
                  ? "No speed yet"
                  : `Last ${Math.round(dictationSummary.lastWordsPerMinute)}`}
              </span>
            </div>
            <div className="dictation-stat">
              <span className="dictation-stat-label">Words dictated</span>
              <strong className="dictation-stat-value">
                {Math.round(dictationSummary.totalWords).toLocaleString()}
              </strong>
            </div>
            <div className="dictation-stat">
              <span className="dictation-stat-label">Total time</span>
              <strong className="dictation-stat-value">
                {formattedTotalTime}
              </strong>
            </div>
          </div>
          <DictationWeekStrip week={dictationSummary.week} />
          <p className="dictation-stats-comment">{funnyDictationComment}</p>
        </div>
      )}

      <div className="home-api-slot">
        <details className="home-api-spoiler" open={!isApiKeyLocked}>
          <summary>Edit API key</summary>
          <div className="home-api-section">
            <p className="home-api-section-label">API key</p>
            <ApiKeyField
              displayValue={apiKeyDisplayValue}
              isLocked={isApiKeyLocked}
              isTesting={isTestingApiKey}
              onChangeKey={onChangeApiKey}
              onSave={onSaveApiKey}
            />
          </div>
        </details>
      </div>

      {errorMessage && !isRecording && !isProcessing && (
        <div className="permission-banner permission-banner--constrained">
          <p className="text-danger">Last dictation failed</p>
          <p className="text-secondary text-secondary--spaced">
            {errorMessage}
          </p>
          <div className="permission-actions permission-actions--spaced">
            <button className="btn btn-ghost btn-sm" onClick={onOpenLogs}>
              Open logs folder
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onDismissError}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {permissions.hotkeyError && !isRecording && (
        <div className="permission-banner permission-banner--constrained">
          <p className="text-danger">Hotkey monitor failed to start.</p>
          <p className="text-secondary text-secondary--spaced">
            {isMac
              ? "Make sure Accessibility is enabled. Use Re-check after granting in Settings."
              : "Try restarting the app. The hotkey shortcut may be in use by another application."}
          </p>
          <div className="permission-actions permission-actions--spaced">
            <button className="btn btn-ghost btn-sm" onClick={onRecheck}>
              Re-check
            </button>
          </div>
        </div>
      )}

      {(isRecording || isProcessing) && (
        <div className="setup-nav">
          {isRecording ? (
            <button className="btn btn-primary" onClick={onStopDictation}>
              Stop
            </button>
          ) : (
            <button className="btn btn-primary" disabled>
              Finalizing...
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DictationWeekStrip({ week }: { week: WeekDay[] }) {
  const maxWords = Math.max(0, ...week.map((day) => day.words));
  return (
    <div
      className="dictation-stats-week"
      role="img"
      aria-label={`Words per day, last 7 days: ${week
        .map((day) => day.words)
        .join(", ")}`}
    >
      {week.map((day) => {
        // Non-empty days always get a visible sliver.
        const percent =
          day.words > 0 && maxWords > 0
            ? Math.max(6, (day.words / maxWords) * 100)
            : 0;
        return (
          <div
            key={day.key}
            className={`dictation-stats-day ${day.isToday ? "today" : ""}`}
            title={`${day.key}: ${day.words.toLocaleString()} words`}
          >
            <div className="dictation-stats-day-track">
              <div
                className="dictation-stats-day-bar"
                style={{ height: `${percent}%` }}
              />
            </div>
            <span className="dictation-stats-day-label">{day.initial}</span>
          </div>
        );
      })}
    </div>
  );
}
