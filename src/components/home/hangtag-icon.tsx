export function HangtagIcon({ className, filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d="M7.25 4.4h6.6L16.75 7.3v11.45c0 .69-.56 1.25-1.25 1.25H7.25c-.69 0-1.25-.56-1.25-1.25V5.65c0-.69.56-1.25 1.25-1.25z"
        fill={filled ? "currentColor" : "none"}
      />
      <path d="M13.85 4.4V7.3h2.9" />
      <circle cx="10.15" cy="9.15" r="1.2" fill={filled ? "none" : "none"} stroke="currentColor" />
    </svg>
  );
}
