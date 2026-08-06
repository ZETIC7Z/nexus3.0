import classNames from "classnames";
import { useState } from "react";

import { ConflixAvatar } from "@/components/ConflixAvatar";
import { ColorPicker } from "@/components/form/ColorPicker";
import { Icon, Icons } from "@/components/Icon";
import { PROFILE_ICON_CATALOG } from "@/stores/profiles/iconCatalog";

export interface AvatarPickerValue {
  image?: string | null;
  colorA: string;
  colorB: string;
  icon: string;
}

interface AvatarPickerProps {
  label?: string;
  value: AvatarPickerValue;
  onChange: (value: AvatarPickerValue) => void;
}

/**
 * Conflix-style avatar picker. Shows the Conflix profile-icon catalog grouped
 * by category ("The Classics", "The Last Airbender", "One Piece") plus a
 * "Nexus style" fallback tab with colors + classic icons for existing users.
 */
export function AvatarPicker(props: AvatarPickerProps) {
  const { value, onChange } = props;
  const [tab, setTab] = useState<"conflix" | "nexus">(
    value.image ? "conflix" : "nexus",
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex rounded-full border border-white/15 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setTab("conflix")}
            className={classNames(
              "rounded-full px-3 py-1 text-xs font-semibold transition",
              tab === "conflix"
                ? "bg-red-600 text-white"
                : "text-white/60 hover:text-white",
            )}
          >
            Conflix icons
          </button>
          <button
            type="button"
            onClick={() => setTab("nexus")}
            className={classNames(
              "rounded-full px-3 py-1 text-xs font-semibold transition",
              tab === "nexus"
                ? "bg-red-600 text-white"
                : "text-white/60 hover:text-white",
            )}
          >
            Nexus style
          </button>
        </div>
      </div>

      {tab === "conflix" ? (
        <div className="max-h-72 overflow-y-auto pr-1 space-y-4">
          {PROFILE_ICON_CATALOG.map((category) => (
            <div key={category.title.name}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">
                {category.title.name}
              </p>
              <div className="grid grid-cols-6 gap-2">
                {category.src.map((src) => {
                  const selected = value.image === src;
                  return (
                    <button
                      key={src}
                      type="button"
                      className={classNames(
                        "aspect-square rounded-[8px] overflow-hidden transition ring-2 ring-transparent hover:ring-white/40",
                        selected ? "ring-white" : "",
                      )}
                      onClick={() => onChange({ ...value, image: src })}
                      aria-label={`Choose ${category.title.name} icon`}
                    >
                      <img
                        src={src}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <ColorPicker
            label="Primary color"
            value={value.colorA}
            onInput={(v) => onChange({ ...value, colorA: v })}
          />
          <ColorPicker
            label="Accent color"
            value={value.colorB}
            onInput={(v) => onChange({ ...value, colorB: v })}
          />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
              Icon
            </p>
            <Icon icon={Icons.USER} className="text-xl text-white" />
            <span className="ml-2 text-xs text-white/40">
              (gradient avatars keep your existing look)
            </span>
          </div>
          {value.image ? (
            <button
              type="button"
              onClick={() => onChange({ ...value, image: null })}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/60 transition hover:border-white/40 hover:text-white"
            >
              Use Nexus avatar instead
            </button>
          ) : null}
        </div>
      )}

      {/* Live preview */}
      <div className="flex items-center gap-3 border-t border-white/10 pt-3">
        <ConflixAvatar
          profile={value}
          sizeClass="w-14 h-14"
          iconClass="text-2xl"
          square
        />
        <div className="text-xs text-white/50">
          <p className="font-semibold text-white/80">Preview</p>
          <p>
            {value.image
              ? "Conflix profile icon"
              : "Nexus gradient avatar"}
          </p>
        </div>
      </div>
    </div>
  );
}
