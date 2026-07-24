import classNames from "classnames";

import { useIsMobile } from "@/hooks/useIsMobile";

export function BrandPill(props: {
  clickable?: boolean;
  header?: boolean;
  backgroundClass?: string;
  large?: boolean;
  noBackground?: boolean;
}) {
  const isMobile = useIsMobile();

  // Logo sizes - smaller player logo
  const getLogoSize = () => {
    if (props.large) {
      return "h-18 md:h-20"; // Video player - smaller
    }
    if (isMobile && props.header) {
      return "h-14"; // Mobile header - more compact
    }
    return "h-16"; // Default/Desktop header
  };

  // On mobile header, NO background - just logo
  if (isMobile && props.header) {
    return (
      <img
        src="/nexus-logo-full.png"
        alt="NEXUS"
        className={`object-contain ${getLogoSize()}`}
      />
    );
  }

  // Video player or explicitly no background - NO background, just logo
  if (props.large || props.noBackground) {
    return (
      <img
        src="/nexus-logo-full.png"
        alt="NEXUS"
        className={`object-contain ${getLogoSize()}`}
      />
    );
  }

  // Desktop header - with background
  return (
    <div
      className={classNames(
        "flex items-center rounded-full px-3 py-1.5",
        props.backgroundClass,
        props.clickable
          ? "transition-transform hover:scale-105 active:scale-95"
          : "",
      )}
    >
      <img
        src="/nexus-logo-full.png"
        alt="NEXUS"
        className={`object-contain ${getLogoSize()}`}
      />
    </div>
  );
}
