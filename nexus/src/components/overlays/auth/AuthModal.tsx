import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAsync, useAsyncFn } from "react-use";
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from "react-google-recaptcha-v3";
import type { AsyncReturnType } from "type-fest";
import classNames from "classnames";

import { OverlayPortal } from "@/components/overlays/OverlayDisplay";
import { useModal } from "@/components/overlays/Modal";
import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { ColorPicker } from "@/components/form/ColorPicker";
import { IconPicker } from "@/components/form/IconPicker";
import { Avatar } from "@/components/Avatar";
import { UserIcons } from "@/components/UserIcon";

import { useAuth } from "@/hooks/auth/useAuth";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useAuthStore } from "@/stores/auth";
import { useBookmarkStore } from "@/stores/bookmarks";
import { useProgressStore } from "@/stores/progress";

import {
  generatePassphraseFromCredentials,
  authenticatePasskey,
  createPasskey,
  isPasskeySupported,
} from "@/backend/accounts/crypto";
import { getBackendMeta } from "@/backend/accounts/meta";
import { editUser } from "@/backend/accounts/user";
import { conf } from "@/setup/config";
import type { AuthMode } from "./hooks/useAuthModal";

function CaptchaProvider(props: { siteKey: string | null; children: React.ReactNode }) {
  if (!props.siteKey) return props.children as JSX.Element;
  return (
    <GoogleReCaptchaProvider reCaptchaKey={props.siteKey} language="en">
      {props.children}
    </GoogleReCaptchaProvider>
  );
}

export function AuthModal({ id }: { id: string }) {
  const { t } = useTranslation();
  const modal = useModal(id);
  const backendUrl = useBackendUrl();
  const config = conf();

  const { login, register, restore, importData } = useAuth();
  const progressItems = useProgressStore((store) => store.items);
  const bookmarkItems = useBookmarkStore((store) => store.bookmarks);
  const updateProfile = useAuthStore((s) => s.setAccountProfile);
  const setAccountNickname = useAuthStore((s) => s.setAccountNickname);
  const account = useAuthStore((s) => s.account);

  const [mode, setMode] = useState<AuthMode>("login");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form Fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loginMode, setLoginMode] = useState<"password" | "passkey">("password");

  // Checkboxes for Trust screen
  const [trustCheck1, setTrustCheck1] = useState(false);
  const [trustCheck2, setTrustCheck2] = useState(false);

  // Animations & Feedback
  const [shakeOnError, setShakeOnError] = useState(false);
  const [isClosingOutro, setIsClosingOutro] = useState(false);

  // Mnemonic and Profile states
  const [mnemonic, setMnemonic] = useState("");
  const [copied, setCopied] = useState(false);
  const [passkeyConnected, setPasskeyConnected] = useState(false);
  const [colorA, setColorA] = useState("#E50914");
  const [colorB, setColorB] = useState("#B20710");
  const [userIcon, setUserIcon] = useState<UserIcons>(UserIcons.CAT);

  // Recaptcha / siteKey fetch
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const metaResult = useAsync(async () => {
    const targetUrl = backendUrl || config.BACKEND_URL;
    if (!targetUrl) return null;
    return getBackendMeta(targetUrl);
  }, [backendUrl, config.BACKEND_URL]);

  useEffect(() => {
    if (metaResult.value) {
      setSiteKey(
        metaResult.value.hasCaptcha && metaResult.value.captchaClientKey
          ? metaResult.value.captchaClientKey
          : null
      );
    }
  }, [metaResult.value]);

  // Handle open-auth-modal event and session storage initial mode
  useEffect(() => {
    const handleOpenEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ mode?: AuthMode }>;
      if (customEvent.detail?.mode) {
        setMode(customEvent.detail.mode);
        setLoginMode("password");
        setUsername("");
        setPassword("");
        setConfirmPassword("");
        setDeviceName("");
        setSuccessMessage(null);
        setMnemonic("");
        setPasskeyConnected(false);
        setTrustCheck1(false);
        setTrustCheck2(false);
        setShakeOnError(false);
        setIsClosingOutro(false);
      }
    };
    window.addEventListener("open-auth-modal", handleOpenEvent);
    return () => window.removeEventListener("open-auth-modal", handleOpenEvent);
  }, []);

  useEffect(() => {
    if (modal.isShown) {
      const stored = sessionStorage.getItem("auth_modal_initial_mode") as AuthMode;
      if (stored) {
        setMode(stored);
        sessionStorage.removeItem("auth_modal_initial_mode");
      } else {
        setMode("login");
      }
      setLoginMode("password");
      setUsername("");
      setPassword("");
      setConfirmPassword("");
      setDeviceName("");
      setSuccessMessage(null);
      setMnemonic("");
      setPasskeyConnected(false);
      setTrustCheck1(false);
      setTrustCheck2(false);
      setShakeOnError(false);
      setIsClosingOutro(false);
    }
  }, [modal.isShown]);

  const handleSuccessOutro = () => {
    setIsClosingOutro(true);
    setTimeout(() => {
      setIsClosingOutro(false);
      setSuccessMessage(null);
      modal.hide();
    }, 700);
  };

  // Login handler with Username & Password
  const [loginResult, handleLoginSubmit] = useAsyncFn(async () => {
    const validatedUsername = username.trim();
    if (validatedUsername.length < 3) {
      setShakeOnError(true);
      setTimeout(() => setShakeOnError(false), 600);
      throw new Error("Username must be at least 3 characters");
    }
    if (password.length < 6) {
      setShakeOnError(true);
      setTimeout(() => setShakeOnError(false), 600);
      throw new Error("Password must be at least 6 characters");
    }

    const targetUrl = backendUrl || config.BACKEND_URL;
    if (!targetUrl) throw new Error("No backend URL configured");

    const generatedMnemonic = await generatePassphraseFromCredentials(validatedUsername, password);

    let accountResult: AsyncReturnType<typeof login>;
    try {
      accountResult = await login({
        mnemonic: generatedMnemonic,
        userData: {
          device: `${validatedUsername}'s device`,
        },
      });
    } catch (err) {
      setShakeOnError(true);
      setPassword("");
      setTimeout(() => setShakeOnError(false), 600);
      if ((err as any).status === 401) throw new Error("Invalid username or password");
      throw err;
    }

    if (!accountResult) {
      setShakeOnError(true);
      setPassword("");
      setTimeout(() => setShakeOnError(false), 600);
      throw new Error("Login failed. Please check your credentials.");
    }

    await importData(accountResult, progressItems, bookmarkItems);
    await restore(accountResult);

    setSuccessMessage(`Log in success, welcome back ${validatedUsername}!`);
    setTimeout(() => {
      handleSuccessOutro();
    }, 1000);
  }, [username, password, backendUrl, config.BACKEND_URL, login, restore, importData, progressItems, bookmarkItems, modal]);

  // Login handler with Passkey / Device Scan
  const [passkeyLoginResult, handlePasskeyLogin] = useAsyncFn(async () => {
    const validatedUsername = username.trim();
    if (!validatedUsername) {
      setShakeOnError(true);
      setTimeout(() => setShakeOnError(false), 600);
      throw new Error("Please input your username to continue using passkey");
    }

    const targetUrl = backendUrl || config.BACKEND_URL;
    if (!targetUrl) throw new Error("No backend URL configured");
    if (!isPasskeySupported()) throw new Error("Passkeys are not supported in this browser");

    let assertion;
    try {
      assertion = await authenticatePasskey();
    } catch (err) {
      setShakeOnError(true);
      setTimeout(() => setShakeOnError(false), 600);
      throw new Error("Invalid username or passkey did not match our records.");
    }

    if (!assertion || !assertion.id) {
      setShakeOnError(true);
      setTimeout(() => setShakeOnError(false), 600);
      throw new Error("Passkey authentication failed");
    }

    let accountResult: AsyncReturnType<typeof login>;
    try {
      accountResult = await login({
        credentialId: assertion.id,
        userData: {
          device: `${validatedUsername}'s Passkey Device`,
        },
      });
    } catch (err) {
      setShakeOnError(true);
      setTimeout(() => setShakeOnError(false), 600);
      if ((err as any).status === 401) throw new Error("No matching account found for this passkey");
      throw new Error("Invalid username or passkey did not match our records.");
    }

    if (!accountResult) {
      setShakeOnError(true);
      setTimeout(() => setShakeOnError(false), 600);
      throw new Error("Login failed. Please check your passkey.");
    }

    await importData(accountResult, progressItems, bookmarkItems);
    await restore(accountResult);

    setSuccessMessage("Signed in successfully with Passkey!");
    setTimeout(() => {
      handleSuccessOutro();
    }, 1000);
  }, [username, backendUrl, config.BACKEND_URL, login, restore, importData, progressItems, bookmarkItems, modal]);

  const { executeRecaptcha } = useGoogleReCaptcha();

  // Registration handler with Username & Password
  const [registerResult, handleRegisterSubmit] = useAsyncFn(async () => {
    const validatedDeviceName = deviceName.trim();
    if (validatedDeviceName.length < 2) throw new Error("Device name must be at least 2 characters");

    const validatedUsername = username.trim();
    if (validatedUsername.length < 3) throw new Error("Username must be at least 3 characters");

    if (password.length < 6) throw new Error("Password must be at least 6 characters");
    if (password !== confirmPassword) throw new Error("Passwords do not match");

    const targetUrl = backendUrl || config.BACKEND_URL;
    if (!targetUrl) throw new Error("No backend URL configured");

    let recaptchaToken: string | undefined;
    if (siteKey) {
      recaptchaToken = executeRecaptcha ? await executeRecaptcha() : undefined;
      if (!recaptchaToken) throw new Error("Captcha verification failed");
    }

    const generatedMnemonic = await generatePassphraseFromCredentials(validatedUsername, password);
    setMnemonic(generatedMnemonic);

    const accountResult = await register({
      mnemonic: generatedMnemonic,
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

    if (!accountResult) throw new Error("Username is already taken.");

    await importData(accountResult, progressItems, bookmarkItems);
    await restore(accountResult);
    setAccountNickname(validatedUsername);

    setSuccessMessage("Account created successfully!");
    setTimeout(() => {
      setSuccessMessage(null);
      setMode("passphrase");
    }, 1500);
  }, [deviceName, username, password, confirmPassword, siteKey, executeRecaptcha, register, restore, importData, progressItems, bookmarkItems, setAccountNickname, backendUrl, config.BACKEND_URL]);

  // Connect passkey right after username/password registration on passphrase screen
  const [connectPasskeyResult, handleConnectPasskey] = useAsyncFn(async () => {
    if (!username) return;
    if (!isPasskeySupported()) throw new Error("Passkeys are not supported in this browser");
    try {
      const credential = await createPasskey(username, username);
      if (credential && credential.id) {
        setPasskeyConnected(true);
      }
    } catch (err) {
      throw new Error(`Failed to connect passkey: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [username]);

  // Profile Save handler
  const [profileResult, handleProfileSubmit] = useAsyncFn(async () => {
    const targetUrl = backendUrl || config.BACKEND_URL;
    if (!targetUrl || !account) return;

    const profileObj = {
      colorA,
      colorB,
      icon: userIcon,
    };

    await editUser(targetUrl, account, {
      profile: profileObj,
    });

    updateProfile(profileObj);

    setSuccessMessage("Everything is complete!");
    setTimeout(() => {
      handleSuccessOutro();
    }, 1000);
  }, [account, colorA, colorB, userIcon, backendUrl, config.BACKEND_URL, updateProfile, modal]);

  const handleCopyPassphrase = async () => {
    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy passphrase:", err);
    }
  };

  const getPasswordStrength = (pass: string) => {
    if (!pass) return null;
    if (pass.length < 6) return { level: "Weak", width: "w-1/3", color: "bg-orange-500", text: "text-orange-400" };
    const hasSpecialOrNum = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pass);
    const hasUpper = /[A-Z]/.test(pass);
    if (pass.length >= 8 && hasSpecialOrNum && hasUpper) {
      return { level: "Strong", width: "w-full", color: "bg-green-500", text: "text-green-400" };
    }
    return { level: "Medium", width: "w-2/3", color: "bg-yellow-500", text: "text-yellow-400" };
  };

  const passStrength = getPasswordStrength(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  return (
    <CaptchaProvider siteKey={siteKey}>
      <OverlayPortal
        darken
        close={modal.hide}
        show={modal.isShown}
        zIndex={1200}
      >
        <div className="flex absolute inset-0 items-center justify-center p-4 pointer-events-auto">
          <div
            className={classNames(
              "w-full sm:max-w-md bg-[#12111f]/85 backdrop-blur-xl border border-white/10 sm:rounded-2xl shadow-2xl overflow-hidden text-white transition-all duration-500",
              isClosingOutro
                ? "scale-25 opacity-0 translate-x-[35vw] -translate-y-[35vh] pointer-events-none"
                : "scale-100 opacity-100 translate-x-0 translate-y-0",
              "fixed sm:relative inset-0 sm:inset-auto flex flex-col justify-center sm:block p-6 sm:p-8 overflow-y-auto sm:max-h-[90vh] no-scrollbar",
              shakeOnError && "animate-shake"
            )}
          >
            {/* Header Close button (top right) */}
            <div className="absolute top-4 right-4 z-10">
              <button
                type="button"
                onClick={modal.hide}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              >
                <Icon icon={Icons.X} className="text-sm" />
              </button>
            </div>

            {successMessage ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4 text-center animate-fade">
                <Icon icon={Icons.CIRCLE_CHECK} className="text-green-500 text-6xl animate-bounce" />
                <h3 className="text-white font-bold text-2xl">{successMessage}</h3>
              </div>
            ) : (
              <div>
                {/* SIGN IN MODE */}
                {mode === "login" && (
                  <div className={`space-y-5 animate-fade ${shakeOnError ? "animate-shake" : ""}`}>
                    <h2 className="text-3xl font-bold text-white tracking-wide">Sign In</h2>

                    {passkeyLoginResult.loading ? (
                      <div className="py-8 flex flex-col items-center justify-center space-y-4 animate-fade">
                        <div className="relative flex items-center justify-center w-16 h-16">
                          <div className="absolute inset-0 rounded-full border-2 border-purple-500/30 animate-ping" />
                          <div className="flex space-x-1.5 items-center justify-center">
                            <div className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <div className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <div className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-bounce" />
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="text-white font-bold text-base">Waiting for device to confirm passkey...</p>
                          <p className="text-gray-400 text-xs mt-1">Please follow the prompt on your browser, phone, or security device.</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                              Username
                            </label>
                            <input
                              type="text"
                              value={username}
                              onChange={(e) => setUsername(e.target.value)}
                              placeholder="Enter your username"
                              autoComplete="username"
                              className="w-full bg-[#1c1a2e] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors text-sm"
                            />
                          </div>

                          <div
                            className={`transition-all duration-300 overflow-hidden ${
                              loginMode === "passkey"
                                ? "max-h-0 opacity-0 m-0 pointer-events-none"
                                : "max-h-24 opacity-100"
                            }`}
                          >
                            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                              Password
                            </label>
                            <div className="relative">
                              <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
                                autoComplete="current-password"
                                className="w-full bg-[#1c1a2e] border border-white/10 rounded-xl px-4 py-3 pr-11 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3.5 top-3.5 text-gray-400 hover:text-white transition-colors"
                              >
                                <Icon icon={showPassword ? Icons.EYE_SLASH : Icons.EYE} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {(loginResult.error || passkeyLoginResult.error) && (
                          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-400 text-xs">
                            <Icon icon={Icons.WARNING} className="flex-shrink-0 text-sm" />
                            <span>{loginResult.error?.message || passkeyLoginResult.error?.message}</span>
                          </div>
                        )}

                        <div className="pt-2 space-y-3">
                          {loginMode === "password" ? (
                            <>
                              <Button
                                theme="purple"
                                loading={loginResult.loading}
                                onClick={handleLoginSubmit}
                                className="w-full justify-center py-3 font-semibold text-base rounded-xl shadow-lg shadow-purple-600/20"
                              >
                                Sign In
                              </Button>

                              <div className="relative flex items-center justify-center my-4">
                                <div className="border-t border-white/10 w-full" />
                                <span className="bg-[#12111f] px-3 text-xs text-gray-400 uppercase tracking-wider absolute">
                                  Or continue with
                                </span>
                              </div>

                              <Button
                                theme="secondary"
                                type="button"
                                onClick={() => {
                                  setLoginMode("passkey");
                                  if (!username.trim()) {
                                    setShakeOnError(true);
                                    setTimeout(() => setShakeOnError(false), 600);
                                  }
                                }}
                                className="w-full justify-center flex items-center gap-2.5 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-sm font-medium"
                              >
                                <Icon icon={Icons.KEY} className="text-lg text-purple-400" />
                                <span>Passkey / Device Scan</span>
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                theme="purple"
                                loading={passkeyLoginResult.loading}
                                onClick={handlePasskeyLogin}
                                className="w-full justify-center flex items-center gap-2.5 py-3 font-semibold text-base rounded-xl shadow-lg shadow-purple-600/20"
                              >
                                <Icon icon={Icons.KEY} className="text-lg text-white" />
                                <span>Sign In with Passkey / Device Scan</span>
                              </Button>

                              <div className="relative flex items-center justify-center my-4">
                                <div className="border-t border-white/10 w-full" />
                                <span className="bg-[#12111f] px-3 text-xs text-gray-400 uppercase tracking-wider absolute">
                                  Or continue with
                                </span>
                              </div>

                              <Button
                                theme="secondary"
                                type="button"
                                onClick={() => setLoginMode("password")}
                                className="w-full justify-center py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-sm font-medium text-gray-300"
                              >
                                Sign In using NEXUS Account (Password)
                              </Button>
                            </>
                          )}
                        </div>
                      </>
                    )}

                    <div className="pt-4 border-t border-white/10 text-center">
                      <span className="text-gray-400 text-sm">New to NEXUS? </span>
                      <button
                        type="button"
                        onClick={() => setMode("trust")}
                        className="text-white font-semibold hover:underline text-sm ml-1"
                      >
                        Sign up now.
                      </button>
                    </div>
                  </div>
                )}

                {/* TRUST BACKEND MODE */}
                {mode === "trust" && (
                  <div className="space-y-6 text-center animate-fade py-2">
                    <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-400 text-3xl">
                      <Icon icon={Icons.CIRCLE_EXCLAMATION} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-white mb-2">Account Authorization</h3>
                      <p className="text-gray-400 text-sm leading-relaxed max-w-sm mx-auto">
                        Do you allow NEXUS to securely store and sync your account and data across all your devices?
                      </p>
                    </div>

                    <div className="space-y-3 text-left bg-[#1c1a2e] p-4 rounded-xl border border-white/10">
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={trustCheck1}
                          onChange={(e) => setTrustCheck1(e.target.checked)}
                          className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                        <span className="text-xs text-gray-300 group-hover:text-white transition-colors">
                          I allow NEXUS to securely store my encrypted account credentials on the cloud database.
                        </span>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={trustCheck2}
                          onChange={(e) => setTrustCheck2(e.target.checked)}
                          className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                        <span className="text-xs text-gray-300 group-hover:text-white transition-colors">
                          I understand that my 12-word passphrase and passkey are required for account recovery.
                        </span>
                      </label>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button
                        theme="secondary"
                        onClick={() => setMode("login")}
                        className="flex-1 justify-center py-3 rounded-xl border border-white/10"
                      >
                        No, go back
                      </Button>
                      <Button
                        theme="purple"
                        disabled={!trustCheck1 || !trustCheck2}
                        onClick={() => setMode("register")}
                        className="flex-1 justify-center py-3 rounded-xl font-semibold shadow-lg shadow-purple-600/20"
                      >
                        Yes, I allow & agree
                      </Button>
                    </div>
                  </div>
                )}

                {/* SIGN UP / REGISTER MODE */}
                {mode === "register" && (
                  <div className="space-y-4 animate-fade">
                    <h2 className="text-3xl font-bold text-white tracking-wide mb-1">Sign Up</h2>
                    <p className="text-gray-400 text-xs mb-4">Complete your info below to create your account.</p>

                    <div className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                          {t("auth.deviceNameLabel") || "Device Name"}
                        </label>
                        <input
                          type="text"
                          value={deviceName}
                          onChange={(e) => setDeviceName(e.target.value)}
                          placeholder={t("auth.deviceNamePlaceholder") || "e.g., My Laptop"}
                          className="w-full bg-[#1c1a2e] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                          Username
                        </label>
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Choose a username"
                          autoComplete="username"
                          className="w-full bg-[#1c1a2e] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                          Password
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Choose a password (min 6 characters)"
                            autoComplete="new-password"
                            className="w-full bg-[#1c1a2e] border border-white/10 rounded-xl px-4 py-2.5 pr-11 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-3 text-gray-400 hover:text-white transition-colors"
                          >
                            <Icon icon={showPassword ? Icons.EYE_SLASH : Icons.EYE} />
                          </button>
                        </div>
                        {passStrength && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                              <div className={classNames("h-full transition-all duration-300", passStrength.color, passStrength.width)} />
                            </div>
                            <span className={classNames("text-xs font-medium", passStrength.text)}>{passStrength.level}</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 flex justify-between items-center">
                          <span>Confirm Password</span>
                          {passwordsMatch && (
                            <span className="text-green-400 flex items-center gap-1 text-xs">
                              <Icon icon={Icons.CIRCLE_CHECK} className="text-sm" /> Match
                            </span>
                          )}
                        </label>
                        <div className="relative">
                          <input
                            type={showConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm your password"
                            autoComplete="new-password"
                            className={classNames(
                              "w-full bg-[#1c1a2e] border rounded-xl px-4 py-2.5 pr-11 text-white placeholder-gray-500 focus:outline-none transition-colors text-sm",
                              passwordsMatch ? "border-green-500/60 focus:border-green-500" : "border-white/10 focus:border-purple-500"
                            )}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3.5 top-3 text-gray-400 hover:text-white transition-colors"
                          >
                            <Icon icon={showConfirmPassword ? Icons.EYE_SLASH : Icons.EYE} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {registerResult.error && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-400 text-xs">
                        <Icon icon={Icons.WARNING} className="flex-shrink-0 text-sm" />
                        <span>{registerResult.error.message}</span>
                      </div>
                    )}

                    <div className="pt-3">
                      <Button
                        theme="purple"
                        loading={registerResult.loading}
                        onClick={handleRegisterSubmit}
                        className="w-full justify-center py-3 font-semibold text-base rounded-xl shadow-lg shadow-purple-600/20"
                      >
                        Create Account with Password
                      </Button>
                    </div>

                    <div className="pt-3 border-t border-white/10 text-center">
                      <span className="text-gray-400 text-sm">Already have an account? </span>
                      <button
                        type="button"
                        onClick={() => setMode("login")}
                        className="text-white font-semibold hover:underline text-sm ml-1"
                      >
                        Sign in here.
                      </button>
                    </div>
                  </div>
                )}

                {/* PASSPHRASE MODE */}
                {mode === "passphrase" && (
                  <div className="space-y-6 animate-fade">
                    <div className="text-center space-y-1">
                      <h3 className="text-2xl font-bold text-white">Account Created!</h3>
                      <p className="text-red-400 font-semibold text-xs leading-relaxed">
                        Save your passphrase below! You will need it to login to your account.<br />
                        <span className="text-red-500 font-bold">Do NOT lose your passphrase!</span>
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-[#1c1a2e] border border-white/10 shadow-inner">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Your 12-Word Passphrase</span>
                        <button
                          type="button"
                          onClick={handleCopyPassphrase}
                          className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-3 py-1 rounded-lg text-gray-300 hover:text-white transition-colors text-xs font-medium"
                        >
                          <Icon icon={copied ? Icons.CIRCLE_CHECK : Icons.COPY} className="text-sm text-purple-400" />
                          {copied ? "Copied!" : "Copy Words"}
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {mnemonic.split(" ").map((word, idx) => (
                          <div
                            key={idx}
                            className="bg-[#12111f] px-2.5 py-2 rounded-lg text-center text-white text-xs font-medium border border-white/5"
                          >
                            <span className="text-gray-500 mr-1.5 text-[10px]">{idx + 1}.</span>
                            {word}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-[#1c1a2e]/60 rounded-xl p-4 border border-white/5 text-center space-y-3">
                      <p className="text-xs text-gray-300">
                        Want to also sign in using biometrics or your device scanner?
                      </p>
                      <Button
                        theme="secondary"
                        loading={connectPasskeyResult.loading}
                        onClick={handleConnectPasskey}
                        disabled={passkeyConnected}
                        className={classNames(
                          "w-full justify-center flex items-center gap-2 text-xs py-2.5 rounded-xl border transition-all",
                          passkeyConnected ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                        )}
                      >
                        <Icon icon={passkeyConnected ? Icons.CIRCLE_CHECK : Icons.KEY} className="text-base" />
                        <span>{passkeyConnected ? "Passkey Connected & Saved!" : "Connect Passkey / Scan Device Now"}</span>
                      </Button>
                      {connectPasskeyResult.error && (
                        <p className="text-red-400 text-xs mt-1">{connectPasskeyResult.error.message}</p>
                      )}
                    </div>

                    <div className="pt-2">
                      <Button
                        theme="purple"
                        onClick={() => setMode("profile")}
                        className="w-full justify-center py-3 font-semibold text-base rounded-xl shadow-lg shadow-purple-600/20"
                      >
                        Continue to Profile Setup
                      </Button>
                    </div>
                  </div>
                )}

                {/* PROFILE MODE */}
                {mode === "profile" && (
                  <div className="space-y-6 animate-fade">
                    <div className="text-center">
                      <h3 className="text-2xl font-bold text-white mb-1">Customize Profile</h3>
                      <p className="text-gray-400 text-xs">Pick your avatar, theme colors, and identity.</p>
                    </div>

                    {/* Live Preview Card */}
                    <div
                      className="p-5 rounded-2xl border border-white/10 relative overflow-hidden flex items-center gap-4 shadow-xl"
                      style={{
                        background: `linear-gradient(135deg, ${colorA}22 0%, ${colorB}44 100%)`,
                      }}
                    >
                      <div
                        className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full blur-2xl opacity-40"
                        style={{ background: colorA }}
                      />
                      <Avatar
                        profile={{ colorA, colorB, icon: userIcon }}
                        iconClass="text-2xl"
                        sizeClass="w-14 h-14 rounded-2xl shadow-lg flex-shrink-0 border border-white/20"
                      />
                      <div className="min-w-0 flex-1 relative z-10">
                        <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Live Preview</p>
                        <p className="text-lg font-bold text-white truncate">@{username || (account as any)?.profile?.nickname || (account as any)?.nickname || "NEXUS User"}</p>
                      </div>
                    </div>

                    <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-1 no-scrollbar">
                      <ColorPicker label="First color" value={colorA} onInput={setColorA} />
                      <ColorPicker label="Second color" value={colorB} onInput={setColorB} />
                      <IconPicker label="User icon" value={userIcon} onInput={setUserIcon} />
                    </div>

                    {profileResult.error && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-400 text-xs">
                        <Icon icon={Icons.WARNING} className="flex-shrink-0 text-sm" />
                        <span>{profileResult.error.message}</span>
                      </div>
                    )}

                    <div className="pt-2">
                      <Button
                        theme="purple"
                        loading={profileResult.loading}
                        onClick={handleProfileSubmit}
                        className="w-full justify-center py-3 font-semibold text-base rounded-xl shadow-lg shadow-purple-600/20"
                      >
                        Finish & Launch NEXUS
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </OverlayPortal>
    </CaptchaProvider>
  );
}
