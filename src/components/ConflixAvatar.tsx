import classNames from "classnames";

import { Avatar } from "@/components/Avatar";
import { AccountProfile } from "@/pages/parts/auth/AccountCreatePart";

export interface ConflixAvatarProps {
  profile: {
    colorA: string;
    colorB: string;
    icon: string;
    image?: string | null;
  };
  sizeClass?: string;
  iconClass?: string;
  /** Force square tiles (profile picker) instead of circles. */
  square?: boolean;
  bottom?: React.ReactNode;
}

/**
 * Conflix-style avatar. When the profile carries an `image` (from the Conflix
 * profile-icon catalog) it renders that image; otherwise it falls back to the
 * Nexus gradient avatar so existing accounts keep working untouched.
 */
export function ConflixAvatar(props: ConflixAvatarProps) {
  const image = props.profile.image;
  const sizeClass = props.sizeClass ?? "w-24 h-24";

  if (!image) {
    return (
      <Avatar
        profile={props.profile as AccountProfile["profile"]}
        sizeClass={sizeClass}
        iconClass={props.iconClass}
        bottom={props.bottom}
        square={props.square}
      />
    );
  }

  return (
    <div className="relative inline-block">
      <div
        className={classNames(
          sizeClass,
          "overflow-hidden bg-black/30",
          props.square ? "rounded-[8px]" : "rounded-full",
        )}
      >
        <img
          src={image}
          alt="profile avatar"
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      </div>
      {props.bottom ? (
        <div className="absolute bottom-0 left-1/2 transform translate-y-1/2 -translate-x-1/2">
          {props.bottom}
        </div>
      ) : null}
    </div>
  );
}
