import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import {
  LargeCard,
  LargeCardButtons,
  LargeCardText,
} from "@/components/layout/LargeCard";

interface PassphraseDisplayPartProps {
  mnemonic: string;
  username: string;
  onNext?: () => void;
}

export function PassphraseDisplayPart(props: PassphraseDisplayPartProps) {
  const { t: _t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const words = props.mnemonic.split(" ");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <LargeCard>
      <LargeCardText
        icon={<Icon icon={Icons.CIRCLE_CHECK} className="text-green-500" />}
        title="Account Created!"
      >
        <p className="text-red-400 font-semibold text-center">
          Save your passphrase! You will need it to login to your account.
          <br />
          <span className="text-red-500 font-bold">
            Do NOT lose your passphrase!
          </span>
        </p>
      </LargeCardText>

      {/* Passphrase Display */}
      <div className="mt-6 p-4 rounded-lg bg-[#1a1a2e] border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <span className="text-gray-400 text-sm font-medium">Passphrase</span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <Icon
              icon={copied ? Icons.CIRCLE_CHECK : Icons.COPY}
              className="text-sm"
            />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {words.map((word) => (
            <div
              key={word}
              className="bg-[#2a2a3e] px-3 py-2 rounded-lg text-center text-white text-sm font-medium"
            >
              {word}
            </div>
          ))}
        </div>
      </div>

      {/* Info Text */}
      <div className="mt-4 text-sm text-gray-400 text-center">
        <p>
          Your account username is:{" "}
          <span className="text-white font-medium">{props.username}</span>
        </p>
        <p className="mt-1">
          You can login with your username and password, or use this passphrase
          directly.
        </p>
      </div>

      <LargeCardButtons>
        <Button theme="purple" onClick={() => props.onNext?.()}>
          I have saved my passphrase
        </Button>
      </LargeCardButtons>
    </LargeCard>
  );
}
