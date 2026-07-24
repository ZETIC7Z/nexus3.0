import { useState } from "react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { Trans, useTranslation } from "react-i18next";
import { useAsyncFn } from "react-use";

import { generatePassphraseFromCredentials } from "@/backend/accounts/crypto";
import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import {
  LargeCard,
  LargeCardButtons,
  LargeCardText,
} from "@/components/layout/LargeCard";
import { MwLink } from "@/components/text/Link";
import { AuthInputBox } from "@/components/text-inputs/AuthInputBox";
import { useAuth } from "@/hooks/auth/useAuth";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useAuthStore } from "@/stores/auth";
import { useBookmarkStore } from "@/stores/bookmarks";
import { useProgressStore } from "@/stores/progress";

interface CredentialsCreatePartProps {
  hasCaptcha?: boolean;
  onNext?: (data: {
    username: string;
    password: string;
    mnemonic: string;
    deviceName: string;
  }) => void;
}

export function CredentialsCreatePart(props: CredentialsCreatePartProps) {
  const { t: _t } = useTranslation();

  const [deviceName, setDeviceName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { register, restore, importData } = useAuth();
  const progressItems = useProgressStore((store) => store.items);
  const bookmarkItems = useBookmarkStore((store) => store.bookmarks);
  const backendUrl = useBackendUrl();
  const { executeRecaptcha } = useGoogleReCaptcha();
  const setAccountNickname = useAuthStore((s) => s.setAccountNickname);

  const [result, execute] = useAsyncFn(
    async (
      inputDeviceName: string,
      inputUsername: string,
      inputPassword: string,
      inputConfirmPassword: string,
    ) => {
      // Validate inputs
      const validatedDeviceName = inputDeviceName.trim();
      if (validatedDeviceName.length < 2)
        throw new Error("Device name must be at least 2 characters");

      const validatedUsername = inputUsername.trim();
      if (validatedUsername.length < 3)
        throw new Error("Username must be at least 3 characters");

      if (inputPassword.length < 6)
        throw new Error("Password must be at least 6 characters");

      if (inputPassword !== inputConfirmPassword)
        throw new Error("Passwords do not match");

      if (!backendUrl) throw new Error("No backend URL configured");

      // Get recaptcha token if needed
      let recaptchaToken: string | undefined;
      if (props.hasCaptcha) {
        recaptchaToken = executeRecaptcha
          ? await executeRecaptcha()
          : undefined;
        if (!recaptchaToken) throw new Error("Captcha verification failed");
      }

      // Generate passphrase from username and password
      const mnemonic = await generatePassphraseFromCredentials(
        validatedUsername,
        inputPassword,
      );

      // Register the account
      const account = await register({
        mnemonic,
        userData: {
          device: validatedDeviceName,
          profile: {
            colorA: "#E50914",
            colorB: "#B20710",
            icon: "user",
          },
        },
        recaptchaToken,
      });

      if (!account) throw new Error("Username is already taken.");

      await importData(account, progressItems, bookmarkItems);
      await restore(account);

      // Store username locally
      setAccountNickname(validatedUsername);

      props.onNext?.({
        deviceName: validatedDeviceName,
        username: validatedUsername,
        password: inputPassword,
        mnemonic,
      });
    },
    [
      props,
      register,
      restore,
      backendUrl,
      executeRecaptcha,
      progressItems,
      bookmarkItems,
      importData,
      setAccountNickname,
    ],
  );

  return (
    <LargeCard>
      <LargeCardText title="Create Account">
        Create your NEXUS account to start watching.
      </LargeCardText>
      <div className="space-y-4">
        <AuthInputBox
          label={_t("auth.deviceNameLabel")}
          value={deviceName}
          onChange={setDeviceName}
          placeholder={_t("auth.deviceNamePlaceholder")}
        />
        <AuthInputBox
          label="Username"
          value={username}
          autoComplete="username"
          name="username"
          onChange={setUsername}
          placeholder="Choose a username"
        />

        {/* Password with show/hide toggle */}
        <div className="relative">
          <AuthInputBox
            label="Password"
            value={password}
            autoComplete="new-password"
            name="password"
            onChange={setPassword}
            placeholder="Choose a password (min 6 characters)"
            passwordToggleable={false}
          />
          <input
            id="password-hidden"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Password"
            className="hidden"
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-9 text-gray-400 hover:text-white transition-colors"
          >
            <Icon icon={showPassword ? Icons.EYE_SLASH : Icons.EYE} />
          </button>
        </div>

        {/* Confirm Password with show/hide toggle */}
        <div className="relative">
          <AuthInputBox
            label="Confirm Password"
            value={confirmPassword}
            autoComplete="new-password"
            name="confirmPassword"
            onChange={setConfirmPassword}
            placeholder="Confirm your password"
            passwordToggleable={false}
          />
          <button
            type="button"
            aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-9 text-gray-400 hover:text-white transition-colors"
          >
            <Icon icon={showConfirmPassword ? Icons.EYE_SLASH : Icons.EYE} />
          </button>
        </div>

        {result.error && !result.loading ? (
          <p className="text-authentication-errorText">
            {result.error.message}
          </p>
        ) : null}
      </div>

      <LargeCardButtons>
        <Button
          theme="purple"
          loading={result.loading}
          onClick={() =>
            execute(deviceName, username, password, confirmPassword)
          }
        >
          Create Account
        </Button>
      </LargeCardButtons>
      <p className="text-center mt-6">
        <Trans i18nKey="auth.hasAccount">
          <MwLink to="/login">.</MwLink>
        </Trans>
      </p>
    </LargeCard>
  );
}
