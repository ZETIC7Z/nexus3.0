import classNames from "classnames";

import { useIsMobile } from "@/hooks/useIsMobile";

export function BrandPill(props: {
  clickable?: boolean;
  header?: boolean;
  backgroundClass?: string;
  large?: boolean;
  noBackground?: boolean;
}) {
  const { isMobile } = useIsMobile();

  // The header switches to the compact square mark on mobile/tablet (<1024px).
  // All other logo placements, including desktop, keep the full NEXUS lockup.
  const logoSrc = isMobile && props.header
    ? "/nexus-logo-mobile.png"
    : "/nexus-logo-full.png";

  const getLogoSize = () => {
    if (props.large) {
      return "h-18 md:h-20";
    }
    if (isMobile && props.header) {
      return "h-14 w-14";
    }
    return "h-16";
  };

  if (isMobile && props.header) {
    return (
      <img
        src={logoSrc}
        alt="NEXUS"
        className={`shrink-0 object-contain ${getLogoSize()}`}
      />
    );
  }

  if (props.large || props.noBackground) {
    return (
      <img
        src={logoSrc}
        alt="NEXUS"
        className={`shrink-0 object-contain ${getLogoSize()}`}
      />
    );
  }

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
        src={logoSrc}
        alt="NEXUS"
        className={`shrink-0 object-contain ${getLogoSize()}`}
      />
    </div>
  );
}
