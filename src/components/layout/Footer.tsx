import { useLocation, Link, useNavigate } from "react-router-dom";

import { Icon, Icons } from "@/components/Icon";
import { BrandPill } from "@/components/layout/BrandPill";
import { WideContainer } from "@/components/layout/WideContainer";
import { SocialLink } from "@/components/SocialLink";
import { conf } from "@/setup/config";
import { useOverlayStack } from "@/stores/interface/overlayStack";

function UtilityLink(props: {
  to?: string;
  children: React.ReactNode;
  onClick?: () => void;
  icon: Icons;
}) {
  const content = (
    <div className="group relative flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 transition-all duration-300 hover:border-white/30 hover:bg-white/10 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]">
      <Icon
        icon={props.icon}
        className="text-white/70 group-hover:text-white transition-colors"
      />
      <span className="text-gray-300 group-hover:text-white text-xs font-bold uppercase tracking-wider transition-colors">
        {props.children}
      </span>
    </div>
  );

  if (props.onClick) {
    return (
      <button type="button" onClick={props.onClick} className="cursor-pointer">
        {content}
      </button>
    );
  }
  return (
    <Link to={props.to || "#"} className="cursor-pointer">
      {content}
    </Link>
  );
}

/** Social-icons-only footer shown on /register, /profile-selection, /onboarding */
function FooterMinimal() {
  return (
    <footer className="mt-auto border-t border-white/5 bg-black/20 w-full">
      <WideContainer ultraWide classNames="py-5">
        <div className="flex flex-col items-center gap-4">
          {/* Social icons only */}
          <div className="flex items-center gap-4">
            <SocialLink
              href="https://www.facebook.com/samxerz.pangilinan"
              color="#1877F2"
              icon={<Icon icon={Icons.FACEBOOK} className="text-lg" />}
            />
            <SocialLink
              href="https://twitter.com"
              color="#1DA1F2"
              icon={<Icon icon={Icons.TWITTER} className="text-lg" />}
            />
            <SocialLink
              href={conf().DISCORD_LINK || "#"}
              color="#5865F2"
              icon={<Icon icon={Icons.DISCORD} className="text-lg" />}
            />
            <SocialLink
              href="mailto:samxerz12@gmail.com"
              color="#EA4335"
              icon={<Icon icon={Icons.MAIL} className="text-lg" />}
            />
          </div>

          {/* Disclaimer text */}
          <p className="text-gray-600 text-[10px] leading-relaxed max-w-xl text-center">
            This site does not host or store any movie or media files on our
            servers. We provide content from third-party services that host such
            media. All trademarks and copyrights belong to their respective
            owners.
          </p>

          {/* Copyright */}
          <p className="text-gray-700 text-[10px] font-medium tracking-widest flex items-center justify-center gap-2 uppercase">
            <span>©</span> 2025 - 2026 ZETICUZ · All Rights Reserved
          </p>
        </div>
      </WideContainer>
    </footer>
  );
}

export function Footer() {
  const navigate = useNavigate();
  const { showModal } = useOverlayStack();

  return (
    <footer className="mt-auto border-t border-white/10 bg-black/40 backdrop-blur-md w-full">
      <WideContainer ultraWide classNames="py-8">
        <div className="flex flex-col gap-8">
          {/* Main Bar: Logo - Links - Socials */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            {/* Left: Logo */}
            <div
              className="cursor-pointer shrink-0 transition-transform hover:scale-105 active:scale-95"
              onClick={() => {
                navigate("/");
                window.scrollTo(0, 0);
              }}
            >
              <BrandPill noBackground />
            </div>

            {/* Center: Utility Links */}
            <div className="flex flex-wrap justify-center items-center gap-4">
              <UtilityLink to="/help" icon={Icons.CIRCLE_QUESTION}>
                FAQ
              </UtilityLink>
              <UtilityLink to="/dmca" icon={Icons.LOCK}>
                DMCA
              </UtilityLink>
              <UtilityLink
                onClick={() => showModal("disclaimer")}
                icon={Icons.CIRCLE_EXCLAMATION}
              >
                Disclaimer
              </UtilityLink>
              <UtilityLink to="/legal" icon={Icons.FILE}>
                Terms
              </UtilityLink>
              <UtilityLink
                onClick={() => showModal("partners")}
                icon={Icons.USER}
              >
                Partners
              </UtilityLink>
            </div>

            {/* Right: Social Media Icons */}
            <div className="flex items-center gap-4 shrink-0">
              <SocialLink
                href="https://www.facebook.com/samxerz.pangilinan"
                color="#1877F2"
                icon={<Icon icon={Icons.FACEBOOK} className="text-lg" />}
              />
              <SocialLink
                href="https://twitter.com"
                color="#1DA1F2"
                icon={<Icon icon={Icons.TWITTER} className="text-lg" />}
              />
              <SocialLink
                href={conf().DISCORD_LINK || "#"}
                color="#5865F2"
                icon={<Icon icon={Icons.DISCORD} className="text-lg" />}
              />
              <SocialLink
                href="mailto:samxerz12@gmail.com"
                color="#EA4335"
                icon={<Icon icon={Icons.MAIL} className="text-lg" />}
              />
            </div>
          </div>

          {/* Disclaimer Text */}
          <div className="text-center border-t border-white/5 pt-6">
            <p className="text-gray-500 text-[11px] leading-relaxed max-w-2xl mx-auto">
              This site does not host or store any movie or media files on our
              servers. We provide content from third-party services that host
              such media. All trademarks and copyrights belong to their
              respective owners.
            </p>
          </div>

          {/* Copyright */}
          <div className="text-center">
            <p className="text-gray-600 text-[10px] font-medium tracking-widest flex items-center justify-center gap-2 uppercase">
              <span>©</span> 2025 - 2026 ZETICUZ · All Rights Reserved
            </p>
          </div>
        </div>
      </WideContainer>
    </footer>
  );
}

/** Smart footer — shows minimal version on auth/registration flow pages */
function SmartFooter() {
  const location = useLocation().pathname;
  const isAuthFlow =
    location.startsWith("/register") ||
    location.startsWith("/profile-selection") ||
    location.startsWith("/onboarding") ||
    location.startsWith("/login");

  if (isAuthFlow) return <FooterMinimal />;
  return <Footer />;
}

export function FooterView(props: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["flex min-h-screen flex-col", props.className || ""].join(
        " ",
      )}
    >
      <div style={{ flex: "1 0 auto" }}>{props.children}</div>
      <SmartFooter />
    </div>
  );
}
