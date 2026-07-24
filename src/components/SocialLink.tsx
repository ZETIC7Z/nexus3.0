import React from "react";

interface SocialLinkProps {
  href: string;
  icon: React.ReactNode;
  color: string;
  className?: string;
}

export function SocialLink({ href, icon, color, className }: SocialLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`group relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white/20 bg-white/5 transition-all duration-500 hover:border-transparent ${className || ""}`}
    >
      <div
        className="absolute inset-0 z-0 translate-y-full transition-transform duration-500 group-hover:translate-y-0"
        style={{ backgroundColor: color }}
      />
      <div className="relative z-10 text-white transition-all duration-500 group-hover:rotate-[360deg]">
        {icon}
      </div>
    </a>
  );
}
