/**
 * Silences a small allow-list of known-benign third-party console errors so
 * the devtools console stays clean for real issues. Each entry is matched
 * against the first console argument; everything else passes through
 * untouched, so real errors are never hidden.
 */
const BENIGN_PATTERNS: string[] = [
  // react-sticky-el logs this when a scroll/resize handler fires between
  // unmount and listener teardown (React StrictMode double-mount race).
  // Pure noise: the sticky bar itself works correctly.
  "Missing required elements",
];

const originalError = console.error.bind(console);

console.error = (...args: unknown[]) => {
  const first = args[0];
  if (
    typeof first === "string" &&
    BENIGN_PATTERNS.some((p) => first.includes(p))
  ) {
    return;
  }
  originalError(...args);
};
