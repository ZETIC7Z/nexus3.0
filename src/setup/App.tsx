import { ReactElement, Suspense, lazy, useEffect, useState } from "react";
import { lazyWithPreload } from "react-lazy-with-preload";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import { convertLegacyUrl, isLegacyUrl } from "@/backend/metadata/getmeta";
import {
  decodeTMDBId,
  generateQuickSearchMediaUrl,
  getMediaDetails,
} from "@/backend/metadata/tmdb";
import { TMDBContentTypes } from "@/backend/metadata/types/tmdb";
import { KID_SAFE_GENRES } from "@/utils/media/kidsSearch";
import { useProfileStore } from "@/stores/profiles";

import { AuthModal } from "@/components/overlays/auth";
import { DetailsModal } from "@/components/overlays/detailsModal";
import { DownloadModal } from "@/components/overlays/downloadModal";
import { GamepadControlsModal } from "@/components/overlays/GamepadControlsModal";
import { KeyboardCommandsEditModal } from "@/components/overlays/KeyboardCommandsEditModal";
import { KeyboardCommandsModal } from "@/components/overlays/KeyboardCommandsModal";
import { NotificationModal } from "@/components/overlays/notificationsModal";
import { SupportInfoModal } from "@/components/overlays/SupportInfoModal";
import { TipJarModal } from "@/components/overlays/tipJarModal";
import { SimklAuthHandler } from "@/components/auth/SimklAuthHandler";
import { UpdateNotice } from "@/components/UpdateNotice";
import { TraktAuthHandler } from "@/components/auth/TraktAuthHandler";
import { useGlobalKeyboardEvents } from "@/hooks/useGlobalKeyboardEvents";
import { useOnlineListener } from "@/hooks/usePing";
import { useNotificationInit } from "@/hooks/useNotifications";
import { AboutPage } from "@/pages/About";
import { AppsPage } from "@/pages/Apps";
import { AllBookmarks } from "@/pages/bookmarks/AllBookmarks";
import { DiscoverMore } from "@/pages/discover/AllMovieLists";
import { Discover } from "@/pages/discover/Discover";
import { MoreContent } from "@/pages/discover/MoreContent";
import MaintenancePage from "@/pages/errors/MaintenancePage";
import { NotFoundPage } from "@/pages/errors/NotFoundPage";
import { HomePage } from "@/pages/HomePage";
import { PersonView } from "@/pages/PersonView";
import { CelPage } from "@/pages/Cel";
import { LegalPage, shouldHaveLegalPage } from "@/pages/Legal";
import { LoginPage } from "@/pages/Login";
import { RegisterPage } from "@/pages/Register";
import { MigrationPage } from "@/pages/migration/Migration";
import { MigrationDirectPage } from "@/pages/migration/MigrationDirect";
import { MigrationDownloadPage } from "@/pages/migration/MigrationDownload";
import { MigrationPasskeyPage } from "@/pages/migration/MigrationPasskey";
import { MigrationUploadPage } from "@/pages/migration/MigrationUpload";
import { OnboardingPage } from "@/pages/onboarding/Onboarding";
import { OnboardingExtensionPage } from "@/pages/onboarding/OnboardingExtension";
import { OnboardingProxyPage } from "@/pages/onboarding/OnboardingProxy";
import { PasPage } from "@/pages/Pas";
import { ProfileSelect } from "@/pages/ProfileSelect";
import { KidsPage } from "@/pages/Kids";
import { SupportPage } from "@/pages/Support";
import { MyAlgorithmPage } from "@/pages/algorithm/MyAlgorithm";
import { WatchHistory } from "@/pages/watchHistory/WatchHistory";
import { Layout } from "@/setup/Layout";
import { useHistoryListener } from "@/stores/history";
import { useClearModalsOnNavigation } from "@/stores/interface/overlayStack";
import { LanguageProvider } from "@/stores/language";
import { conf } from "@/setup/config";

const AdminPage = lazy(() => import("@/pages/admin/AdminPage").then((module) => ({ default: module.AdminPage })));
const DeveloperPage = lazy(() => import("@/pages/DeveloperPage"));
const TestView = lazy(() => import("@/pages/developer/TestView"));
const VideoTesterView = lazy(() => import("@/pages/developer/VideoTesterView"));
const PlayerView = lazyWithPreload(() => import("@/pages/PlayerView"));
const SettingsPage = lazyWithPreload(() => import("@/pages/Settings"));

PlayerView.preload();
SettingsPage.preload();

/**
 * Netflix-style kids lockdown: while a kids profile is active, only kid-safe
 * surfaces (/kids, /profiles, /settings, /media) are reachable. Anything else
 * (browse, discover, bookmarks, history, person pages, …) bounces back to
 * /kids so no adult content can ever be displayed.
 */
function KidsRouteGuard({ children }: { children: ReactElement }) {
  const location = useLocation();
  const isKidsActive = useProfileStore((s) => {
    if (!s.activeProfileId) return false;
    const active = s.profiles.find((p) => p.id === s.activeProfileId);
    return !!active?.isKids;
  });

  if (!isKidsActive) return children;

  const path = location.pathname;
  const allowed =
    path.startsWith("/kids") ||
    path === "/profiles" ||
    path === "/settings" ||
    path.startsWith("/media/");
  if (allowed) return children;

  return <Navigate to="/kids" replace />;
}

/**
 * Guards direct /media/:media URL access while a kids profile is active.
 * Browsing/search are already kid-filtered, but someone could type a URL to
 * an arbitrary title — so we verify the actual media's genres before allowing
 * playback. Anything without a core kids genre bounces back to /kids.
 */
function MediaKidsGuard() {
  const { media } = useParams<{ media: string }>();
  const isKidsActive = useProfileStore((s) => {
    if (!s.activeProfileId) return false;
    const active = s.profiles.find((p) => p.id === s.activeProfileId);
    return !!active?.isKids;
  });
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOk(null);
    if (!isKidsActive || !media) {
      setOk(true);
      return;
    }
    const decoded = decodeTMDBId(media);
    if (!decoded) {
      setOk(false);
      return;
    }
    getMediaDetails(
      decoded.id,
      decoded.type === "movie" ? TMDBContentTypes.MOVIE : TMDBContentTypes.TV,
      false,
    )
      .then((data: any) => {
        if (cancelled) return;
        const genres: number[] = (data?.genres ?? []).map((g: any) => g.id);
        const kidSafe = genres.some((g) => KID_SAFE_GENRES.has(g));
        // Some kid titles list no genres at all — treat as safe rather than
        // blocking; the content itself came from kid-filtered sources.
        setOk(genres.length === 0 || kidSafe);
      })
      .catch(() => {
        if (!cancelled) setOk(true); // let the player handle load errors
      });
    return () => {
      cancelled = true;
    };
  }, [media, isKidsActive]);

  if (ok === false) return <Navigate to="/kids" replace />;
  return null; // guard passes; caller wraps the actual page
}

function LegacyUrlView({ children }: { children: ReactElement }) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const url = location.pathname;
    if (!isLegacyUrl(url)) return;
    convertLegacyUrl(location.pathname).then((convertedUrl) => {
      navigate(convertedUrl ?? "/", { replace: true });
    });
  }, [location.pathname, navigate]);

  if (isLegacyUrl(location.pathname)) return null;
  return children;
}

function QuickSearch() {
  const { query } = useParams<{ query: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (query) {
      generateQuickSearchMediaUrl(query).then((url) => {
        navigate(url ?? "/", { replace: true });
      });
    } else {
      navigate("/", { replace: true });
    }
  }, [query, navigate]);

  return null;
}

function QueryView() {
  const { query } = useParams<{ query: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (query) {
      navigate(`/browse/${encodeURIComponent(query)}`, { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [query, navigate]);

  return null;
}

export const maintenanceTime = "March 31th 11:00 PM - 5:00 AM EST";

function App() {
  useHistoryListener();
  useOnlineListener();
  useGlobalKeyboardEvents();
  useClearModalsOnNavigation();
  useNotificationInit();
  const location = useLocation();
  const isWatchPage = location.pathname.startsWith("/media/");
  const maintenance = false; // Shows maintance page
  const [showDowntime, setShowDowntime] = useState(maintenance);

  useEffect(() => {
    const cfg = conf();
    if (!cfg.ENABLE_RYBBIT || !cfg.RYBBIT_SCRIPT_URL || !cfg.RYBBIT_SITE_ID) return;
    if (typeof document === "undefined") return;
    if (document.querySelector("script[data-rybbit]")) return;
    const s = document.createElement("script");
    s.src = cfg.RYBBIT_SCRIPT_URL;
    s.defer = true;
    s.dataset.siteId = cfg.RYBBIT_SITE_ID;
    s.dataset.rybbit = "1";
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    // Never load ad scripts while actively watching -- a popunder firing
    // mid-playback is exactly the kind of thing that tanks retention.
    if (isWatchPage) return;
    const cfg = conf();
    if (!cfg.ENABLE_POPUNDER || !cfg.POPUNDER_SCRIPT_URL) return;
    if (typeof document === "undefined") return;
    if (document.querySelector("script[data-popunder]")) return;

    const KEY = "__pu_last";
    const cooldownMs = 2 * 60 * 60 * 1000;

    try {
      const last = parseInt(localStorage.getItem(KEY) ?? "0", 10);
      if (Number.isFinite(last) && last > 0 && Date.now() - last < cooldownMs) {
        return;
      }
    } catch {
      /* ignore */
    }

    const s = document.createElement("script");
    s.src = cfg.POPUNDER_SCRIPT_URL;
    s.async = true;
    s.setAttribute("data-cfasync", "false");
    s.dataset.popunder = "1";
    s.addEventListener("load", () => {
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    });
    document.head.appendChild(s);
  }, []);

  const handleButtonClick = () => {
    setShowDowntime(false);
  };

  useEffect(() => {
    const sessionToken = sessionStorage.getItem("downtimeToken");
    if (!sessionToken && maintenance) {
      setShowDowntime(true);
      sessionStorage.setItem("downtimeToken", "true");
    }
  }, [setShowDowntime, maintenance]);

  return (
    <Layout>
      <TraktAuthHandler />
      <SimklAuthHandler />
      <LanguageProvider />
      <UpdateNotice />
      <AuthModal id="auth" />
      <NotificationModal id="notifications" />
      <TipJarModal id="tip-jar" />
      <DownloadModal id="download" />
      <KeyboardCommandsModal id="keyboard-commands" />
      <KeyboardCommandsEditModal id="keyboard-commands-edit" />
      <GamepadControlsModal id="gamepad-controls-edit" />
      <SupportInfoModal id="support-info" />
      <DetailsModal id="details" />
      <DetailsModal id="discover-details" />
      <DetailsModal id="player-details" />
      {/* DebugFab: dev-only floating panel (cookie/ratings/local-data resets) */}
      {!showDowntime && (
        <Routes>
          {/* functional routes */}
          <Route path="/s/:query" element={<QuickSearch />} />
          <Route path="/search/:type" element={<Navigate to="/browse" />} />
          <Route path="/search/:type/:query?" element={<QueryView />} />
          {/* pages */}
          <Route
            path="/media/:media"
            element={
              <LegacyUrlView>
                <>
                  <MediaKidsGuard />
                  <Suspense fallback={null}>
                    <PlayerView />
                  </Suspense>
                </>
              </LegacyUrlView>
            }
          />
          <Route
            path="/media/:media/:season/:episode"
            element={
              <LegacyUrlView>
                <>
                  <MediaKidsGuard />
                  <Suspense fallback={null}>
                    <PlayerView />
                  </Suspense>
                </>
              </LegacyUrlView>
            }
          />
          <Route path="/browse/:query?" element={<KidsRouteGuard><HomePage /></KidsRouteGuard>} />
          <Route path="/" element={<KidsRouteGuard><HomePage /></KidsRouteGuard>} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/profiles" element={<ProfileSelect />} />
          <Route path="/kids/:query?" element={<KidsPage />} />
          <Route path="/about" element={<KidsRouteGuard><AboutPage /></KidsRouteGuard>} />
          <Route path="/apps" element={<KidsRouteGuard><AppsPage /></KidsRouteGuard>} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route
            path="/onboarding/extension"
            element={<OnboardingExtensionPage />}
          />
          <Route path="/onboarding/proxy" element={<OnboardingProxyPage />} />

          {/* Migration pages - awaiting import and export fixes */}
          <Route path="/migration" element={<MigrationPage />} />
          <Route path="/migration/direct" element={<MigrationDirectPage />} />
          <Route
            path="/migration/download"
            element={<MigrationDownloadPage />}
          />
          <Route path="/migration/upload" element={<MigrationUploadPage />} />
          <Route path="/migration/passkey" element={<MigrationPasskeyPage />} />

          {shouldHaveLegalPage() ? (
            <Route path="/legal" element={<LegalPage />} />
          ) : null}
          {/* Support page */}
          <Route path="/support" element={<KidsRouteGuard><SupportPage /></KidsRouteGuard>} />
          <Route path="/cel" element={<KidsRouteGuard><CelPage /></KidsRouteGuard>} />
          <Route path="/pas" element={<KidsRouteGuard><PasPage /></KidsRouteGuard>} />
          {/* Discover pages */}
          <Route path="/discover" element={<KidsRouteGuard><Discover /></KidsRouteGuard>} />
          <Route
            path="/discover/more/:contentType/:mediaType"
            element={
              <KidsRouteGuard>
                <MoreContent />
              </KidsRouteGuard>
            }
          />
          <Route
            path="/discover/more/:contentType/:id/:mediaType"
            element={
              <KidsRouteGuard>
                <MoreContent />
              </KidsRouteGuard>
            }
          />
          <Route path="/discover/more/:category" element={<KidsRouteGuard><MoreContent /></KidsRouteGuard>} />
          <Route path="/discover/all" element={<KidsRouteGuard><DiscoverMore /></KidsRouteGuard>} />
          {/* Bookmarks page */}
          <Route path="/bookmarks" element={<KidsRouteGuard><AllBookmarks /></KidsRouteGuard>} />
          <Route path="/person/:id" element={<KidsRouteGuard><PersonView /></KidsRouteGuard>} />
          {/* Watch History page */}
          <Route path="/watch-history" element={<KidsRouteGuard><WatchHistory /></KidsRouteGuard>} />
          <Route path="/algorithm" element={<KidsRouteGuard><MyAlgorithmPage /></KidsRouteGuard>} />
          {/* Settings page */}
          <Route
            path="/settings"
            element={
              <Suspense fallback={null}>
                <SettingsPage />
              </Suspense>
            }
          />
          {/* Diagnostic/admin tools are development-only. They expose powerful
              stream testing controls and infrastructure metadata. */}
          {import.meta.env.DEV ? (
            <>
              <Route
                path="/admin"
                element={
                  <Suspense fallback={null}>
                    <AdminPage />
                  </Suspense>
                }
              />
              <Route
                path="/dev"
                element={
                  <Suspense fallback={null}>
                    <DeveloperPage />
                  </Suspense>
                }
              />
              <Route
                path="/dev/video"
                element={
                  <Suspense fallback={null}>
                    <VideoTesterView />
                  </Suspense>
                }
              />
              <Route
                path="/dev/test"
                element={
                  <Suspense fallback={null}>
                    <TestView />
                  </Suspense>
                }
              />
            </>
          ) : null}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      )}
      {showDowntime && (
        <MaintenancePage onHomeButtonClick={handleButtonClick} />
      )}
    </Layout>
  );
}

export default App;
