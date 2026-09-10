export function StatusBar() {
  return (
    <div className="status-bar" aria-hidden>
      <span className="status-bar-time">9:41</span>
      <span className="status-bar-icons">
        <svg viewBox="0 0 18 12" className="size-4" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="0.6" />
          <rect x="5" y="5" width="3" height="7" rx="0.6" />
          <rect x="10" y="2.5" width="3" height="9.5" rx="0.6" />
          <rect x="15" y="0" width="3" height="12" rx="0.6" opacity="0.35" />
        </svg>
        <svg viewBox="0 0 16 12" className="size-4" fill="currentColor">
          <path d="M8 3.2c1.7 0 3.3.6 4.6 1.8l.9-.9C11.8 2.4 10 1.6 8 1.6S4.2 2.4 2.5 4.1l.9.9C4.7 3.8 6.3 3.2 8 3.2Zm0 3.1c.9 0 1.7.3 2.4.9l.9-.9C10.4 5.5 9.2 5 8 5s-2.4.5-3.3 1.3l.9.9c.7-.6 1.5-.9 2.4-.9Zm0 3.2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
        </svg>
        <span className="status-bar-battery">
          <svg viewBox="0 0 27 13" className="h-3 w-[1.7rem]">
            <rect
              x="0.6"
              y="0.6"
              width="23"
              height="11.8"
              rx="2.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <rect x="24.4" y="4.2" width="1.8" height="4.6" rx="0.6" fill="currentColor" opacity="0.45" />
            <rect x="2.2" y="2.2" width="19.8" height="8.6" rx="1.4" fill="currentColor" />
          </svg>
        </span>
      </span>
    </div>
  );
}
