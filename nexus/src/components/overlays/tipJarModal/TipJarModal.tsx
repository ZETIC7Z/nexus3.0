import { useCallback, useState } from "react";

import { Icon, Icons } from "@/components/Icon";
import { FancyModal } from "@/components/overlays/Modal";

interface TipAddress {
  symbol: string;
  name: string;
  network?: string;
  address: string;
 
  pillClass: string;
}

const TIP_ADDRESSES: TipAddress[] = [
  {
    symbol: "PayPal",
    name: "PayPal",
    address: "To be added...",
    pillClass: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  },
  {
    symbol: "Wise",
    name: "Wise",
    address: "To be added...",
    pillClass: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  },
  {
    symbol: "GoTyme",
    name: "Gotyme Bank",
    address: "To be added...",
    pillClass: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
  },
  {
    symbol: "Binance",
    name: "Binance",
    address: "To be added...",
    pillClass: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  },
];

function AddressRow({ entry }: { entry: TipAddress }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(entry.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
     
      try {
        const ta = document.createElement("textarea");
        ta.value = entry.address;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } catch {
      
      }
    }
  }, [entry.address]);

  return (
    <div className="rounded-2xl bg-modal-background/60 hover:bg-modal-background/80 transition-colors border border-utils-divider/40 p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`flex items-center justify-center text-xs font-bold rounded-md px-2 py-1 tracking-wide ${entry.pillClass}`}
          >
            {entry.symbol}
          </span>
          <div className="min-w-0">
            <div className="text-white font-medium truncate">{entry.name}</div>
            {entry.network ? (
              <div className="text-xs text-type-secondary">{entry.network}</div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-all ${
            copied
              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
              : "bg-white/5 text-white/80 border-white/10 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Icon icon={copied ? Icons.CHECKMARK : Icons.COPY} />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="block w-full text-left font-mono text-xs sm:text-sm text-type-secondary hover:text-white break-all bg-black/20 rounded-lg p-2.5 border border-white/5 hover:border-white/10 transition-colors"
        title="Click to copy"
      >
        {entry.address}
      </button>
    </div>
  );
}

export function TipJarModal({ id }: { id: string }) {
  return (
    <FancyModal id={id} title="Tip Jar" size="md">
      <div className="space-y-4">
        <p className="text-type-secondary text-base leading-relaxed">
          nexus is free and %99 ad-free. If you'd like to support hosting + the
          server bill, we would love your support on any amount to one of the addresses below. Tap an
          address to copy it.
        </p>

        <div className="space-y-3">
          {TIP_ADDRESSES.map((entry) => (
            <AddressRow key={`${entry.symbol}-${entry.address}`} entry={entry} />
          ))}
        </div>

        <div className="text-xs text-type-dimmed text-center pt-2">
          Thank you 💛 every tip helps keep the lights on.
        </div>
      </div>
    </FancyModal>
  );
}
