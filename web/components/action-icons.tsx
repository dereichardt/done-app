type ActionIconProps = {
  size?: number;
  className?: string;
};

export function CalendarIcon({ size = 16, className = "shrink-0" }: ActionIconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={className}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 3v3m8-3v3M4.5 9.2h15M6.3 6.2h11.4a1.8 1.8 0 0 1 1.8 1.8v12.1a1.8 1.8 0 0 1-1.8 1.8H6.3a1.8 1.8 0 0 1-1.8-1.8V8a1.8 1.8 0 0 1 1.8-1.8Z"
      />
    </svg>
  );
}

export function TrashIcon({ size = 16, className = "shrink-0" }: ActionIconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={className}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 4h6M4 7h16M7 7l1 12h8l1-12M10 10v6M14 10v6"
      />
    </svg>
  );
}

export function UndoIcon({ size = 16, className = "shrink-0" }: ActionIconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={className}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 7 5 12l5 5"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12h9a5 5 0 1 1 0 10h-2.5"
      />
    </svg>
  );
}

export function EditIcon({ size = 16, className = "shrink-0" }: ActionIconProps) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.443l-3.251.93a.75.75 0 01-.927-.928l.929-3.25c.08-.287.234-.547.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.939 1.94 1.262-1.263a.25.25 0 000-.354l-1.086-1.086a.25.25 0 00-.353 0zM9.75 4.81l-6.286 6.287a.26.26 0 00-.099.07l-.679 2.37 2.372-.678a.25.25 0 00.07-.1l6.285-6.286-1.94-1.94z"
      />
    </svg>
  );
}
