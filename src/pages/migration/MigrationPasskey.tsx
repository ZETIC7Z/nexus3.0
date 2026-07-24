import { useState } from "react";
import { useAsyncFn } from "react-use";
import { useNavigate } from "react-router-dom";

import {
  createPasskey,
  genMnemonic,
  isPasskeySupported,
  keysFromCredentialId,
  keysFromMnemonic,
  bytesToBase64,
  bytesToBase64Url,
  signChallenge,
  encryptData,
  storeCredentialMapping,
} from "@/backend/accounts/crypto";
import { getLoginChallengeToken, loginAccount } from "@/backend/accounts/login";
import { getRekeyChallengeToken, rekeyAccount } from "@/backend/accounts/rekey";
import { getUser } from "@/backend/accounts/user";
import { Button } from "@/components/buttons/Button";
import { PassphraseDisplay } from "@/components/form/PassphraseDisplay";
import { Icon, Icons } from "@/components/Icon";
import { SettingsCard } from "@/components/layout/SettingsCard";
import { CenterContainer } from "@/components/layout/ThinContainer";
import { AuthInputBox } from "@/components/text-inputs/AuthInputBox";
import { Heading2, Paragraph } from "@/components/utils/Text";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { MinimalPageLayout } from "@/pages/layouts/MinimalPageLayout";
import { PageTitle } from "@/pages/parts/util/PageTitle";
import { useAuthStore } from "@/stores/auth";

type Step = "input" | "loggedIn" | "passphrase" | "done";

export function MigrationPasskeyPage() {
  const navigate = useNavigate();
  const backendUrl = useBackendUrl();
  const [credentialId, setCredentialId] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [newMnemonic] = useState(() => genMnemonic());

  // Step 1: Paste credential ID → log into old account directly
  const [loginResult, loginWithCredential] = useAsyncFn(async () => {
    if (!backendUrl) throw new Error("No backend URL configured");
    const trimmed = credentialId.trim();
    if (!trimmed) throw new Error("Please paste your credential ID");

    const keys = await keysFromCredentialId(trimmed);
    const publicKeyBase64Url = bytesToBase64Url(keys.publicKey);

    const { challenge } = await getLoginChallengeToken(
      backendUrl,
      publicKeyBase64Url,
    );
    const signature = await signChallenge(keys, challenge);
    const result = await loginAccount(backendUrl, {
      challenge: { code: challenge, signature },
      publicKey: publicKeyBase64Url,
      device: await encryptData("Passkey Recovery", keys.seed),
    });

    const user = await getUser(backendUrl, result.token);
    useAuthStore.getState().setAccount({
      token: result.token,
      sessionId: result.session.id,
      userId: user.user.id,
      seed: bytesToBase64(keys.seed),
      nickname: user.user.nickname,
      profile: user.user.profile,
      deviceName: "Passkey Recovery",
    });

    setStep("loggedIn");
  }, [credentialId, backendUrl]);

  // Option A: Bind a new passkey on nexus.mov
  const [passkeyResult, bindNewPasskey] = useAsyncFn(async () => {
    if (!backendUrl) throw new Error("No backend URL configured");
    if (!isPasskeySupported())
      throw new Error("Passkeys not supported in this browser");

    const trimmedOld = credentialId.trim();
    if (!trimmedOld) throw new Error("Missing old credential ID");
    const oldKeys = await keysFromCredentialId(trimmedOld);
    const oldPublicKey = bytesToBase64Url(oldKeys.publicKey);

    const credential = await createPasskey(
      `user-${Date.now()}`,
      "NEXUS User",
    );
    const newCredId = credential.id;
    const newKeys = await keysFromCredentialId(newCredId);
    const newPublicKey = bytesToBase64Url(newKeys.publicKey);

    const { challenge } = await getRekeyChallengeToken(backendUrl, oldPublicKey);
    const oldSignature = await signChallenge(oldKeys, challenge);
    const newSignature = await signChallenge(newKeys, challenge);

    const result = await rekeyAccount(backendUrl, {
      oldPublicKey,
      newPublicKey,
      challenge: { code: challenge, oldSignature, newSignature },
      device: await encryptData("NEXUS Passkey", newKeys.seed),
    });

    storeCredentialMapping(backendUrl, newPublicKey, newCredId);

    useAuthStore.getState().setAccount({
      token: result.token,
      sessionId: result.session.id,
      userId: result.user.id,
      seed: bytesToBase64(newKeys.seed),
      nickname: result.user.nickname,
      profile: result.user.profile,
      deviceName: "NEXUS Passkey",
    });

    setStep("done");
  }, [backendUrl, credentialId]);

  // Option B: Bind a passphrase
  const [phraseResult, bindPassphrase] = useAsyncFn(async () => {
    if (!backendUrl) throw new Error("No backend URL configured");

    const trimmedOld = credentialId.trim();
    if (!trimmedOld) throw new Error("Missing old credential ID");
    const oldKeys = await keysFromCredentialId(trimmedOld);
    const oldPublicKey = bytesToBase64Url(oldKeys.publicKey);

    const newKeys = await keysFromMnemonic(newMnemonic);
    const newPublicKey = bytesToBase64Url(newKeys.publicKey);

    const { challenge } = await getRekeyChallengeToken(backendUrl, oldPublicKey);
    const oldSignature = await signChallenge(oldKeys, challenge);
    const newSignature = await signChallenge(newKeys, challenge);

    const result = await rekeyAccount(backendUrl, {
      oldPublicKey,
      newPublicKey,
      challenge: { code: challenge, oldSignature, newSignature },
      device: await encryptData("NEXUS", newKeys.seed),
    });

    useAuthStore.getState().setAccount({
      token: result.token,
      sessionId: result.session.id,
      userId: result.user.id,
      seed: bytesToBase64(newKeys.seed),
      nickname: result.user.nickname,
      profile: result.user.profile,
      deviceName: "NEXUS",
    });

    setStep("done");
  }, [backendUrl, credentialId, newMnemonic]);

  return (
    <MinimalPageLayout>
      <PageTitle subpage k="global.pages.migration" />
      <CenterContainer>
        <div>
          <Heading2 className="!text-4xl !mt-0">Passkey Recovery</Heading2>
          <Paragraph className="text-lg max-w-md mb-6">
            Recover your account from an old domain-bound passkey.
          </Paragraph>

          {step === "input" && (
            <SettingsCard>
              <div className="space-y-4">
                <h3 className="font-bold text-white text-lg">
                  Paste your Credential ID
                </h3>
                <p className="text-type-secondary text-sm">
                  Go to the export page on the old domain, click
                  &quot;Extract My Credentials&quot;, and paste the
                  Credential ID here.
                </p>
                <AuthInputBox
                  label="Credential ID"
                  value={credentialId}
                  onChange={setCredentialId}
                  placeholder="e.g. AbCdEf123..."
                />
                {loginResult.error && (
                  <p className="text-red-400 text-sm">
                    {loginResult.error.message.includes("401")
                      ? "No account found for this credential ID."
                      : loginResult.error.message}
                  </p>
                )}
                <Button
                  theme="purple"
                  className="w-full"
                  onClick={loginWithCredential}
                  loading={loginResult.loading}
                  disabled={loginResult.loading || !credentialId.trim()}
                >
                  Log Into My Account
                </Button>
              </div>
            </SettingsCard>
          )}

          {step === "loggedIn" && (
            <div className="space-y-4">
              <SettingsCard>
                <div className="flex items-center gap-2 mb-4">
                  <Icon
                    icon={Icons.CHECKMARK}
                    className="text-green-400 text-xl"
                  />
                  <span className="text-green-400 font-medium">
                    You&apos;re logged in — your data is here.
                  </span>
                </div>
                <p className="text-type-secondary text-sm">
                  Now secure your account with a new login method so you
                  don&apos;t get locked out again.
                </p>
              </SettingsCard>

              <Paragraph className="!mt-6 !mb-4 font-medium">
                Choose a new login method:
              </Paragraph>

              {isPasskeySupported() && (
                <SettingsCard>
                  <div className="space-y-3">
                    <h3 className="font-bold text-white">
                      <Icon icon={Icons.LOCK} className="mr-2" />
                      New Passkey (on nexus.mov)
                    </h3>
                    <p className="text-type-secondary text-sm">
                      Creates a new passkey bound to the current domain.
                      If the domain changes again you&apos;ll need to
                      repeat this process.
                    </p>
                    {passkeyResult.error && (
                      <p className="text-red-400 text-sm">
                        {passkeyResult.error.message}
                      </p>
                    )}
                    <Button
                      theme="purple"
                      className="w-full"
                      onClick={bindNewPasskey}
                      loading={passkeyResult.loading}
                      disabled={
                        passkeyResult.loading || phraseResult.loading
                      }
                    >
                      Create New Passkey
                    </Button>
                  </div>
                </SettingsCard>
              )}

              <SettingsCard>
                <div className="space-y-3">
                  <h3 className="font-bold text-white">
                    <Icon icon={Icons.USER} className="mr-2" />
                    Passphrase (recommended)
                  </h3>
                  <p className="text-type-secondary text-sm">
                    Works on any domain, any browser, any device. Write it
                    down and you&apos;ll never get locked out.
                  </p>
                  <Button
                    theme="secondary"
                    className="w-full"
                    onClick={() => setStep("passphrase")}
                    disabled={
                      passkeyResult.loading || phraseResult.loading
                    }
                  >
                    Use Passphrase Instead
                  </Button>
                </div>
              </SettingsCard>

              <div className="pt-4">
                <Button theme="secondary" onClick={() => navigate("/")}>
                  Skip — just use my old account as-is
                </Button>
              </div>
            </div>
          )}

          {step === "passphrase" && (
            <SettingsCard>
              <div className="space-y-4">
                <h3 className="font-bold text-white text-lg">
                  Your New Passphrase
                </h3>
                <p className="text-type-secondary text-sm">
                  Write this down. This is the only way to log into your
                  new account.
                </p>
                <PassphraseDisplay mnemonic={newMnemonic} />
                {phraseResult.error && (
                  <p className="text-red-400 text-sm">
                    {phraseResult.error.message}
                  </p>
                )}
                <Button
                  theme="purple"
                  className="w-full"
                  onClick={bindPassphrase}
                  loading={phraseResult.loading}
                  disabled={phraseResult.loading}
                >
                  I Saved It — Create Account
                </Button>
                <Button
                  theme="secondary"
                  className="w-full"
                  onClick={() => setStep("loggedIn")}
                  disabled={phraseResult.loading}
                >
                  Back
                </Button>
              </div>
            </SettingsCard>
          )}

          {step === "done" && (
            <SettingsCard>
              <div className="text-center space-y-4 py-6">
                <Icon
                  icon={Icons.CHECKMARK}
                  className="text-green-400 text-4xl"
                />
                <h3 className="font-bold text-white text-lg">
                  All Done
                </h3>
                <p className="text-type-secondary text-sm">
                  Your account is ready and all your bookmarks and history are
                  intact. You&apos;re logged in now.
                </p>
                <Button theme="purple" onClick={() => navigate("/")}>
                  Go Home
                </Button>
              </div>
            </SettingsCard>
          )}

          {step === "input" && (
            <div className="flex justify-between mt-6">
              <Button
                theme="secondary"
                onClick={() => navigate("/migration")}
              >
                Back to Migration
              </Button>
            </div>
          )}
        </div>
      </CenterContainer>
    </MinimalPageLayout>
  );
}
