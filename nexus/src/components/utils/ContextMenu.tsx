import classNames from "classnames";
import { ReactNode, useEffect } from "react";

export interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function ContextMenu({
  x,
  y,
  onClose,
  children,
  className,
}: ContextMenuProps) {
  useEffect(() => {
    const handleClick = () => onClose();
    // Delay attaching the listener to prevent the current click event from immediately closing the menu
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClick);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClick);
    };
  }, [onClose]);

  // Ensure it doesn't go off screen
  const safeX = Math.min(x, window.innerWidth - 220);
  const safeY = Math.min(y, window.innerHeight - 300);

  return (
    <div
      className={classNames(
        "fixed z-[200] bg-dropdown-background rounded-xl shadow-xl border border-white/10 py-2 text-sm text-white min-w-[200px] max-h-[300px] overflow-y-auto backdrop-blur-md custom-scrollbar",
        className,
      )}
      style={{ top: safeY, left: safeX }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}

export function ContextMenuItem({
  children,
  onClick,
  disabled,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={classNames(
        "w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition-colors",
        disabled
          ? "opacity-30 cursor-not-allowed"
          : "hover:bg-white/10 cursor-pointer text-white",
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function ContextMenuDivider() {
  return <div className="h-px bg-white/10 my-1 w-full" />;
}
