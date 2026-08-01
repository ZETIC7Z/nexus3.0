import classNames from "classnames";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { NoUserAvatar, UserAvatar } from "@/components/Avatar";
import { IconPatch } from "@/components/buttons/IconPatch";
import { Icon, Icons } from "@/components/Icon";
import { LinksDropdown } from "@/components/layout/LinksDropdown";
import { useDownloadModal } from "@/components/overlays/downloadModal";
import { useNotifications } from "@/components/overlays/notificationsModal";
import { Lightbar } from "@/components/utils/Lightbar";
import { useAuth } from "@/hooks/auth/useAuth";
import { BlurEllipsis } from "@/pages/layouts/SubPageLayout";
import { useBannerSize } from "@/stores/banner";
import { usePreferencesStore } from "@/stores/preferences";

import { HomeSectionCustomizer } from "@/pages/parts/home/HomeSectionCustomizer";

import { BrandPill } from "./BrandPill";

function HomeLayoutCustomizerToggle() {
  const [isOpen, setIsOpen] = useState(false);
  
  // Only show on the exact home page path
  if (window.location.pathname !== "/") return null;
  
  return (
    <div className="relative">
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex items-center h-10 rounded-full transition-all duration-300 ease-out overflow-hidden ${
          isOpen
            ? "bg-type-link text-white shadow-lg pr-4"
            : "bg-pill-background bg-opacity-50 text-white hover:bg-pill-backgroundHover hover:bg-opacity-100 hover:pr-4 active:scale-105"
        }`}
        title="Edit Layout"
      >
        <div className="flex items-center justify-center w-10 h-10 shrink-0">
          <Icon icon={Icons.LAYOUT} className="text-xl" />
        </div>
        <span className={`font-medium text-sm whitespace-nowrap transition-all duration-300 ease-out ${
          isOpen
            ? "max-w-[100px] opacity-100"
            : "max-w-0 opacity-0 group-hover:max-w-[100px] group-hover:opacity-100"
        }`}>
          Layout
        </span>
      </button>
      <HomeSectionCustomizer 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)} 
      />
    </div>
  );
}

export interface NavigationProps {
  bg?: boolean;
  noLightbar?: boolean;
  doBackground?: boolean;
  clearBackground?: boolean;
}

export function Navigation(props: NavigationProps) {
  const bannerHeight = useBannerSize();
  const { loggedIn } = useAuth();
  const [scrollPosition, setScrollPosition] = useState(0);
  const { openNotifications, getUnreadCount } = useNotifications();
  const { openDownloadModal } = useDownloadModal();

  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);


  const getMaskLength = () => {
    
    const maxScroll = 300;
    const minLength = 100;
    const maxLength = 180;
    const scrollFactor = Math.min(scrollPosition, maxScroll) / maxScroll;
    return minLength + (maxLength - minLength) * (1 - scrollFactor);
  };

  const enableLowPerformanceMode = usePreferencesStore(
    (s) => s.enableLowPerformanceMode,
  );

  return (
    <>
      {/* lightbar */}
      {!props.noLightbar ? (
        <div
          className="absolute inset-x-0 top-0 flex h-[88px] items-center justify-center"
          style={{
            top: `${bannerHeight}px`,
          }}
        >
          <div className="absolute inset-x-0 -mt-[22%] flex items-center sm:mt-0">
            <Lightbar noParticles={enableLowPerformanceMode} />
          </div>
        </div>
      ) : null}

      {/* backgrounds - these are seperate because of z-index issues */}
      <div
        className="top-content fixed z-[20] pointer-events-none left-0 right-0 top-0 min-h-[150px]"
        style={{
          top: `${bannerHeight}px`,
        }}
      >
        <div
          className={classNames(
            "fixed left-0 right-0 top-0 flex items-center", // border-b border-utils-divider border-opacity-50
            "transition-[background-color,backdrop-filter] duration-300 ease-in-out",
            props.doBackground
              ? props.clearBackground
                ? "backdrop-blur-md bg-transparent"
                : "bg-background-main"
              : "bg-transparent",
          )}
        >
          {props.doBackground ? (
            <div className="absolute w-full h-full inset-0 overflow-hidden">
              <BlurEllipsis positionClass="absolute" />
            </div>
          ) : null}
          <div className="opacity-0 absolute inset-0 block h-20 pointer-events-auto" />
          <div
            className={classNames(
              "transition-[background-color,backdrop-filter,opacity] duration-300 ease-in-out",
              props.bg ? "opacity-100" : "opacity-0",
              "absolute inset-0 block h-[11rem]",
              props.clearBackground
                ? "backdrop-blur-md bg-transparent"
                : "bg-background-main",
            )}
            style={{
              maskImage: `linear-gradient(
                to bottom,
                rgba(0, 0, 0, 1),
                rgba(0, 0, 0, 1) calc(100% - ${getMaskLength()}px),
                rgba(0, 0, 0, 0) 100%
              )`,
              WebkitMaskImage: `linear-gradient(
                to bottom,
                rgba(0, 0, 0, 1),
                rgba(0, 0, 0, 1) calc(100% - ${getMaskLength()}px),
                rgba(0, 0, 0, 0) 100%
              )`,
            }}
          />
        </div>
      </div>

      {/* content */}
      <div
        className="top-content fixed pointer-events-none left-0 right-0 z-[500] top-0 min-h-[150px]"
        style={{
          top: `${bannerHeight}px`,
        }}
      >
        <div className={classNames("fixed left-0 right-0 flex items-center")}>
          <div className="px-7 py-5 relative z-[60] flex flex-1 items-center justify-between">
            <div className="flex items-center space-x-1.5 ssm:space-x-3 pointer-events-auto">
              <Link
                className="block shrink-0 tabbable rounded-full text-xs ssm:text-base"
                to="/"
                onClick={() => window.scrollTo(0, 0)}
              >
                <BrandPill clickable header />
              </Link>
              <a
                onClick={() => openDownloadModal()}
                rel="noreferrer"
                className="text-xl text-white tabbable rounded-full backdrop-blur-lg"
                title="Download"
              >
                <IconPatch
                  icon={Icons.DOWNLOAD}
                  clickable
                  downsized
                  navigation
                />
              </a>

              <a
                onClick={() => openNotifications()}
                rel="noreferrer"
                className="text-xl text-white tabbable rounded-full backdrop-blur-lg relative"
              >
                <IconPatch icon={Icons.BELL} clickable downsized navigation />
                {(() => {
                  const count = getUnreadCount();
                  const shouldShow =
                    typeof count === "number" ? count > 0 : count === "99+";
                  return shouldShow ? (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[16px] aspect-square flex items-center justify-center">
                      {count}
                    </span>
                  ) : null;
                })()}
              </a>
            </div>
            <div className="relative pointer-events-auto flex items-center gap-3">
              <HomeLayoutCustomizerToggle />
              <LinksDropdown>
                {loggedIn ? <UserAvatar withName /> : <NoUserAvatar />}
              </LinksDropdown>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
