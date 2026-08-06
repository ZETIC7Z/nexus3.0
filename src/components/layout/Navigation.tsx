import classNames from "classnames";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { NoUserAvatar, UserAvatar } from "@/components/Avatar";
import { Icon, Icons } from "@/components/Icon";
import { LinksDropdown } from "@/components/layout/LinksDropdown";
import { useDownloadModal } from "@/components/overlays/downloadModal";
import { useNotifications } from "@/components/overlays/notificationsModal";
import { useAuth } from "@/hooks/auth/useAuth";
import { useBannerSize } from "@/stores/banner";
import { BrandPill } from "./BrandPill";

const NAV_LINKS = [
  { label: "Home", path: "/browse", icon: null },
  { label: "Discover", path: "/discover", icon: null },
  { label: "Bookmarks", path: "/bookmarks", icon: null },
  { label: "History", path: "/watch-history", icon: null },
];

export interface NavigationProps {
  bg?: boolean;
  noLightbar?: boolean;
  doBackground?: boolean;
  clearBackground?: boolean;
}

export function Navigation(_props: NavigationProps) {
  const bannerHeight = useBannerSize();
  const { loggedIn } = useAuth();
  const [scrollY, setScrollY] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { openNotifications, getUnreadCount } = useNotifications();
  const { openDownloadModal } = useDownloadModal();
  const location = useLocation();
  const navigate = useNavigate();

  // Hide navigation on watch page (player page) - Netflix-style immersive experience
  const isWatchPage = location.pathname.startsWith("/media/");
  const isKidsPage = location.pathname === "/kids";
  const isProfilesPage = location.pathname === "/profiles";

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [searchOpen]);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(
        isKidsPage
          ? `/kids/${encodeURIComponent(searchQuery.trim())}`
          : `/browse/${encodeURIComponent(searchQuery.trim())}`,
      );
      setSearchOpen(false);
      setSearchQuery("");
    }
  };

  // Live search — same behavior as the homepage hero search: every keystroke
  // updates the URL so the page below re-renders results instantly.
  const handleKidsSearchChange = (value: string) => {
    setSearchQuery(value);
    const trimmed = value.trim();
    if (trimmed) {
      navigate(`/kids/${encodeURIComponent(trimmed)}`, { replace: true });
    } else {
      navigate("/kids", { replace: true });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setSearchOpen(false);
      setSearchQuery("");
    }
  };

  const isScrolled = scrollY > 50;

  // Don't render on watch page or profiles page
  if (isWatchPage || isProfilesPage) return null;

  // Kids profile: simplified header — logo, "Kids" label, an inline search
  // (same as the main profile) and the kids avatar. No nav links, no
  // notifications, no settings. Search navigates to /kids/:query so the kids
  // page renders kid-filtered results, Netflix-style.
  if (isKidsPage) {
    return (
      <nav
        className={classNames(
          "fixed top-0 left-0 right-0 z-[500] transition-all duration-300 ease-out h-16",
          isScrolled
            ? "bg-[#141414] shadow-lg"
            : "bg-gradient-to-b from-black/80 to-transparent",
        )}
        style={{ paddingTop: `${bannerHeight}px` }}
      >
        <div className="flex items-center justify-between px-4 md:px-8 lg:px-12 h-16">
          <div className="flex items-center gap-3">
            <BrandPill clickable header />
            <span className="text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider bg-gradient-to-r from-[#00D2FF] to-[#3A7BD5] text-white">
              Kids
            </span>
          </div>

          {/* Search — same inline behavior as the main profile */}
          <div className="flex-1 max-w-xs md:max-w-sm mx-4">
            {searchOpen ? (
              <form
                onSubmit={handleSearch}
                className="flex items-center gap-2 bg-black/60 border border-white/20 rounded-full px-3 py-1.5"
              >
                <Icon icon={Icons.SEARCH} className="text-white/70 text-sm" />
                <input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => handleKidsSearchChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search kids shows & movies"
                  className="bg-transparent text-white text-sm placeholder-white/50 outline-none w-full"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchQuery("");
                    navigate("/kids", { replace: true });
                  }}
                  className="text-white/50 hover:text-white"
                >
                  <Icon icon={Icons.X} className="text-xs" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="text-white/70 hover:text-white transition-colors p-1"
                title="Search kids shows & movies"
              >
                <Icon icon={Icons.SEARCH} className="text-xl" />
              </button>
            )}
          </div>

          {loggedIn && (
            <button
              type="button"
              onClick={() => navigate("/profiles")}
              className="flex items-center gap-2 hover:bg-white/10 rounded-full p-1 transition-colors"
              title="Back to profiles"
            >
              <UserAvatar sizeClass="w-8 h-8" iconClass="text-sm" />
            </button>
          )}
        </div>
      </nav>
    );
  }

  return (
    <>
      {/* Netflix-style Fixed Navigation */}
      <nav
        className={classNames(
          "fixed top-0 left-0 right-0 z-[500] transition-all duration-300 ease-out",
          isScrolled
            ? "bg-[#141414] shadow-lg"
            : "bg-gradient-to-b from-black/80 to-transparent",
        )}
        style={{
          paddingTop: `${bannerHeight}px`,
          backdropFilter: isScrolled ? "none" : undefined,
        }}
      >
        <div className="flex items-center justify-between px-4 md:px-8 lg:px-12 h-16 md:h-17">
          {/* Left Section: Logo + Nav Links */}
          <div className="flex items-center gap-6 md:gap-8">
            {/* NEXUS Logo */}
            <Link
              to={loggedIn ? "/browse" : "/"}
              className="flex-shrink-0"
              onClick={() => window.scrollTo(0, 0)}
            >
              <BrandPill clickable header />
            </Link>

            {/* Primary Navigation Links (visible on md+) */}
            <div className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map((link) => {
                const isActive =
                  location.pathname === link.path ||
                  location.pathname.startsWith(link.path + "/");
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={classNames(
                      "px-3 py-1 text-sm font-medium rounded transition-all duration-200",
                      "hover:text-white/90",
                      isActive
                        ? "text-white"
                        : "text-white/60 hover:text-white/80",
                    )}
                  >
                    <span className="relative">
                      {link.label}
                      {isActive && (
                        <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-red-600 rounded-full" />
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>

            {/* Mobile Browse All (Netflix-style) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-white/80 hover:text-white text-sm font-medium flex items-center gap-1"
            >
              Browse
              <Icon
                icon={Icons.CHEVRON_DOWN}
                className={classNames(
                  "text-xs transition-transform duration-200",
                  mobileMenuOpen ? "rotate-180" : "",
                )}
              />
            </button>
          </div>

          {/* Right Section: Icons + Avatar */}
          <div className="flex items-center gap-3 md:gap-4">
            {/* Search */}
            {searchOpen ? (
              <form
                onSubmit={handleSearch}
                className="flex items-center gap-2 bg-black/60 border border-white/20 rounded-sm px-2 py-1"
              >
                <Icon icon={Icons.SEARCH} className="text-white/70 text-sm" />
                <input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={() => {
                    if (!searchQuery) {
                      setSearchOpen(false);
                    }
                  }}
                  placeholder="Titles, people, genres"
                  className="bg-transparent text-white text-sm placeholder-white/50 outline-none w-32 md:w-48"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchQuery("");
                  }}
                  className="text-white/50 hover:text-white"
                >
                  <Icon icon={Icons.X} className="text-xs" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="text-white/70 hover:text-white transition-colors p-1"
                title="Search"
                onKeyDown={(e) => {
                  if (e.key === "/" && !searchOpen) {
                    e.preventDefault();
                    setSearchOpen(true);
                  }
                }}
              >
                <Icon icon={Icons.SEARCH} className="text-xl" />
              </button>
            )}

            {/* Notifications */}
            <button
              type="button"
              onClick={() => openNotifications()}
              className="text-white/70 hover:text-white transition-colors p-1 relative"
              title="Notifications"
            >
              <Icon icon={Icons.BELL} className="text-xl" />
              {(() => {
                const count = getUnreadCount();
                const shouldShow =
                  typeof count === "number" ? count > 0 : count === "99+";
                return shouldShow ? (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                    {count}
                  </span>
                ) : null;
              })()}
            </button>

            {/* Download (mobile hidden) */}
            <button
              type="button"
              onClick={() => openDownloadModal()}
              className="hidden md:block text-white/70 hover:text-white transition-colors p-1"
              title="Downloads"
            >
              <Icon icon={Icons.DOWNLOAD} className="text-xl" />
            </button>

            {/* User Avatar + Dropdown (Netflix-style) */}
            <LinksDropdown>
              <div className="flex items-center gap-2 cursor-pointer group">
                {loggedIn ? (
                  <>
                    <UserAvatar
                      sizeClass="w-7 h-7 md:w-8 md:h-8"
                      iconClass="text-sm"
                    />
                    <Icon
                      icon={Icons.CHEVRON_DOWN}
                      className="hidden md:block text-white/60 group-hover:text-white text-xs transition-colors"
                    />
                  </>
                ) : (
                  <NoUserAvatar />
                )}
              </div>
            </LinksDropdown>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#141414] border-t border-white/10 shadow-2xl animate-fadeIn">
            <div className="py-2 px-4">
              {NAV_LINKS.map((link) => {
                const isActive =
                  location.pathname === link.path ||
                  location.pathname.startsWith(link.path + "/");
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={classNames(
                      "block py-3 px-2 text-sm rounded transition-colors",
                      isActive
                        ? "text-white bg-white/10"
                        : "text-white/60 hover:text-white hover:bg-white/5",
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  openDownloadModal();
                  setMobileMenuOpen(false);
                }}
                className="block w-full text-left py-3 px-2 text-sm text-white/60 hover:text-white hover:bg-white/5 rounded transition-colors"
              >
                Downloads
              </button>
            </div>
          </div>
        )}

        {/* Bottom gradient overlay when not scrolled */}
        {!isScrolled && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-b from-transparent to-black/5 pointer-events-none" />
        )}
      </nav>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
