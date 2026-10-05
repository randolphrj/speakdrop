/** SpeakDrop wordmark: the app-icon drop plus the name in the UI font. */
export function SpeakDropLogo({ className }: { className?: string }) {
  return (
    <span
      className={className ?? "logo-wordmark speakdrop-wordmark"}
      role="img"
      aria-label="SpeakDrop"
    >
      <svg viewBox="0 0 1024 1024" aria-hidden="true">
        <path
          d="M512 150 C512 150 262 446 262 624 A250 250 0 0 0 762 624 C762 446 512 150 512 150 Z"
          fill="var(--text-brand)"
        />
        <g fill="var(--text-primary)">
          <rect x="380" y="596" width="40" height="88" rx="20" />
          <rect x="436" y="552" width="40" height="176" rx="20" />
          <rect x="492" y="508" width="40" height="264" rx="20" />
          <rect x="548" y="552" width="40" height="176" rx="20" />
          <rect x="604" y="596" width="40" height="88" rx="20" />
        </g>
      </svg>
      SpeakDrop
    </span>
  );
}
