import classNames from "classnames";
import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Sticky from "react-sticky-el";

import { SearchBarInput } from "@/components/form/SearchBar";
import { Icon, Icons } from "@/components/Icon";
import { ThinContainer } from "@/components/layout/ThinContainer";
import { useSlashFocus } from "@/components/player/hooks/useSlashFocus";
import { HeroTitle } from "@/components/text/HeroTitle";
import { useIsIOS, useIsMobile, useIsPWA } from "@/hooks/useIsMobile";
import { useIsTV } from "@/hooks/useIsTv";
import { useRandomTranslation } from "@/hooks/useRandomTranslation";
import { useSearchQuery } from "@/hooks/useSearchQuery";
import { useBannerSize } from "@/stores/banner";

import { GenreChips } from "./GenreChips";

export interface HeroPartProps {
  setIsSticky: (val: boolean) => void;
  searchParams: ReturnType<typeof useSearchQuery>;
  showTitle?: boolean;
  isInFeatured?: boolean;
}

function getTimeOfDay(
  date: Date,
): "night" | "morning" | "day" | "420" | "69" | "halloween" {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (month === 4 && day === 20) return "420";
  if (month === 6 && day === 9) return "69";
  if (month === 10 && day === 31) return "halloween";
  const hour = date.getHours();
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 19) return "day";
  return "night";
}

export function HeroPart({
  setIsSticky,
  searchParams,
  showTitle,
  isInFeatured,
}: HeroPartProps) {
  const { t: randomT } = useRandomTranslation();
  const [search, setSearch, setSearchUnFocus] = searchParams;
  const [showBg, setShowBg] = useState(false);
  const bannerSize = useBannerSize();
  const { isMobile } = useIsMobile();
  const { isTV } = useIsTV();

  const stickStateChanged = useCallback(
    (isFixed: boolean) => {
      setShowBg(isFixed);
      setIsSticky(isFixed);
    },
    [setIsSticky],
  );

  const isPWA = useIsPWA();
  const isIOS = useIsIOS();
  const isIOSPWA = isIOS && isPWA;

  // Navbar height is 80px (h-20)
  const navbarHeight = 80;
  // On desktop: inline with navbar (same top position + 14px adjustment)
  // On mobile: below navbar (navbar height + banner)
  const topOffset = isMobile
    ? navbarHeight + bannerSize + (isIOSPWA ? 34 : 0)
    : bannerSize + 14;

  const time = getTimeOfDay(new Date());
  const title = randomT(`home.titles.${time}`);
  const placeholder = randomT(`home.search.placeholder`);
  const inputRef = useRef<HTMLInputElement>(null);
  useSlashFocus(inputRef);

  return (
    <ThinContainer>
      <div
        className={classNames(
          "space-y-16 text-center",
          showTitle ? "mt-44" : "mt-4",
        )}
      >
        {showTitle && (!isTV || search.length === 0) ? (
          <div className="relative z-10 mb-16">
            <HeroTitle className="mx-auto max-w-md">{title}</HeroTitle>
          </div>
        ) : null}

        <div className="relative z-30">
          <div className="h-20">
            <Sticky
              topOffset={-topOffset}
              stickyStyle={{
                paddingTop: `${topOffset}px`,
              }}
              onFixedToggle={stickStateChanged}
              scrollElement="window"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <SearchBarInput
                    ref={inputRef}
                    onChange={setSearch}
                    value={search}
                    onUnFocus={setSearchUnFocus}
                    placeholder={placeholder ?? ""}
                    isSticky={showBg}
                    isInFeatured={isInFeatured}
                  />
                </div>
                {!isInFeatured && (
                  <Link
                    to="/discover"
                    className="group relative flex items-center justify-center h-14 rounded-[28px] bg-search-background/50 hover:bg-search-background backdrop-blur-sm transition-[transform,background-color] duration-300 ease-spring hover:scale-105 active:scale-95 overflow-hidden"
                  >
                    <div className="absolute inset-0 rounded-[28px] bg-[linear-gradient(90deg,#a855f7,#ec4899,#d946ef,#c084fc,#a855f7,#ec4899,#d946ef,#c084fc,#a855f7)] bg-[length:300%_100%] opacity-70 group-hover:opacity-100 transition-opacity duration-500 animate-gradient-flow" />
                    <div className="absolute inset-[2px] rounded-[26px] bg-search-background transition-colors duration-300" />

                    <div className="relative flex items-center justify-center px-4 sm:px-5 gap-2 h-full">
                      <Icon
                        icon={Icons.RISING_STAR}
                        className="text-search-icon group-hover:text-pink-400 transition-colors duration-300 text-xl group-hover:rotate-12"
                      />
                      <span className="max-w-0 opacity-0 group-hover:max-w-[80px] group-hover:opacity-100 group-hover:ml-1 text-white font-bold text-sm tracking-wide bg-gradient-to-r from-pink-400 to-fuchsia-400 bg-clip-text group-hover:text-transparent transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden hidden sm:block">
                        Discover
                      </span>
                    </div>
                  </Link>
                )}
              </div>
            </Sticky>
          </div>

          {(!search || search.length === 0) && (
            <GenreChips />
          )}
        </div>
      </div>
    </ThinContainer>
  );
}
