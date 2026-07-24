import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useAsyncFn } from "react-use";
import type { AsyncReturnType } from "type-fest";

import { generatePassphraseFromCredentials } from "@/backend/accounts/crypto";
import { Button } from "@/components/buttons/Button";
import { BrandPill } from "@/components/layout/BrandPill";
import {
  LargeCard,
  LargeCardButtons,
  LargeCardText,
} from "@/components/layout/LargeCard";
import { MwLink } from "@/components/text/Link";
import { AuthInputBox } from "@/components/text-inputs/AuthInputBox";
import { useAuth } from "@/hooks/auth/useAuth";
import { useBookmarkStore } from "@/stores/bookmarks";
import { useProgressStore } from "@/stores/progress";

interface LoginFormPartProps {
  onLogin?: () => void;
}

export function LoginFormPart(props: LoginFormPartProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, restore, importData } = useAuth();
  const progressItems = useProgressStore((store) => store.items);
  const bookmarkItems = useBookmarkStore((store) => store.bookmarks);
  const { t: _t } = useTranslation();

  const [result, execute] = useAsyncFn(
    async (inputUsername: string, inputPassword: string) => {
      // Validate inputs
      const validatedUsername = inputUsername.trim();
      if (validatedUsername.length < 3)
        throw new Error("Username must be at least 3 characters");

      if (inputPassword.length < 6)
        throw new Error("Password must be at least 6 characters");

      // Generate passphrase from username and password for backend compatibility
      const mnemonic = await generatePassphraseFromCredentials(
        validatedUsername,
        inputPassword,
      );

      let account: AsyncReturnType<typeof login>;
      try {
        account = await login({
          mnemonic,
          userData: {
            device: `${validatedUsername}'s device`,
          },
        });
      } catch (err) {
        if ((err as any).status === 401)
          throw new Error("Invalid username or password");
        throw err;
      }

      if (!account)
        throw new Error("Login failed. Please check your credentials.");

      await importData(account, progressItems, bookmarkItems);

      await restore(account);

      props.onLogin?.();
    },
    [props, login, restore],
  );

  return (
    <LargeCard top={<BrandPill backgroundClass="bg-[#161527]" />}>
      <LargeCardText title="Sign In">
        Welcome back! Sign in to access your account.
      </LargeCardText>
      <div className="space-y-4">
        <AuthInputBox
          label="Username"
          value={username}
          autoComplete="username"
          name="username"
          onChange={setUsername}
          placeholder="Enter your username"
        />
        <AuthInputBox
          label="Password"
          value={password}
          autoComplete="current-password"
          name="password"
          onChange={setPassword}
          placeholder="Enter your password"
          passwordToggleable
        />
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
          onClick={() => execute(username, password)}
        >
          Sign In
        </Button>
      </LargeCardButtons>
      <p className="text-center mt-6">
        <Trans i18nKey="auth.createAccount">
          <MwLink to="/register">.</MwLink>
        </Trans>
      </p>
    </LargeCard>
  );
}
