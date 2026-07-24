import { useWindowSize } from "react-use";

/**
 * Returns the current number of columns in the MediaGrid based on window width.
 * Breakpoints match tailwind.config.ts and MediaGrid.tsx classes:
 * grid-cols-2 gap-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 3xl:grid-cols-8 4xl:grid-cols-10
 */
export function useMediaGridColumns(): number {
  const { width } = useWindowSize();

  if (width >= 3840) return 10; // 4xl
  if (width >= 2650) return 8;  // 3xl
  if (width >= 1280) return 6;  // xl
  if (width >= 768) return 4;   // md
  if (width >= 640) return 3;   // sm
  
  return 2; // default
}
