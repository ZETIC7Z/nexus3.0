import { Icon, Icons } from "@/components/Icon";
import { FancyModal } from "@/components/overlays/Modal";
import { openWindowSafely } from "@/setup/popupGuard";
import { conf } from "@/setup/config";

interface DownloadOption {
  key: string;
  icon: Icons;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  iconClass: string;
}

function optionsFor(): DownloadOption[] {
  return [
    {
      key: "windows",
      icon: Icons.DISCORD,
      title: "Windows App",
      subtitle: "Native desktop app, distributed through our Discord.",
      cta: "Join & Get It",
      href: conf().DISCORD_LINK,
      iconClass: "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30",
    },
    {
      key: "android-tv",
      icon: Icons.DOWNLOAD,
      title: "Android & TV App",
      subtitle: "APK releases for Android phones, tablets, and Android TV.",
      cta: "View Releases",
      href: "https://github.com/alturyxx-gif/NEXUS-Android/releases",
      iconClass: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
    },
  ];
}

function DownloadRow({ option }: { option: DownloadOption }) {
  return (
    <button
      type="button"
      onClick={() => openWindowSafely(option.href, "_blank")}
      className="group w-full rounded-2xl bg-modal-background/60 hover:bg-modal-background/80 transition-colors border border-utils-divider/40 hover:border-white/10 p-4 text-left"
    >
      <div className="flex items-center gap-4">
        <span
          className={`flex shrink-0 items-center justify-center h-11 w-11 rounded-xl text-xl ${option.iconClass}`}
        >
          <Icon icon={option.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-white font-medium">{option.title}</div>
          <div className="text-xs text-type-secondary mt-0.5">
            {option.subtitle}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border bg-white/5 text-white/80 border-white/10 transition-all group-hover:bg-white/10 group-hover:text-white">
          {option.cta}
          <Icon
            icon={Icons.CHEVRON_RIGHT}
            className="text-sm transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </button>
  );
}

export function DownloadModal({ id }: { id: string }) {
  return (
    <FancyModal id={id} title="Download NEXUS" size="md">
      <div className="space-y-4">
        <p className="text-type-secondary text-base leading-relaxed">
          Take NEXUS with you. Pick your platform below.
        </p>

        <div className="space-y-3">
          {optionsFor().map((option) => (
            <DownloadRow key={option.key} option={option} />
          ))}
        </div>
      </div>
    </FancyModal>
  );
}
