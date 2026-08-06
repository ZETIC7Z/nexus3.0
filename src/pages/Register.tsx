import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/buttons/Button";
import { BackendSelector } from "@/components/form/BackendSelector";
import {
  LargeCard,
  LargeCardButtons,
  LargeCardText,
} from "@/components/layout/LargeCard";
import { SubPageLayout } from "@/pages/layouts/SubPageLayout";
import {
  AccountCreatePart,
  AccountProfile,
} from "@/pages/parts/auth/AccountCreatePart";
import { TrustBackendPart } from "@/pages/parts/auth/TrustBackendPart";
import { PageTitle } from "@/pages/parts/util/PageTitle";
import { conf } from "@/setup/config";
import { useAuthStore } from "@/stores/auth";

export function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const setBackendUrl = useAuthStore((s) => s.setBackendUrl);
  const currentBackendUrl = useAuthStore((s) => s.backendUrl);
  const config = conf();
  const availableBackends =
    config.BACKEND_URLS.length > 0
      ? config.BACKEND_URLS
      : config.BACKEND_URL
        ? [config.BACKEND_URL]
        : [];

  const defaultBackend =
    currentBackendUrl ??
    (availableBackends.length === 1 ? availableBackends[0] : null);

  const [step, setStep] = useState(
    availableBackends.length > 1 || !defaultBackend ? -1 : 0,
  );
  const [account, setAccount] = useState<null | AccountProfile>(null);
  const [selectedBackendUrl, setSelectedBackendUrl] = useState<string | null>(
    currentBackendUrl ?? defaultBackend ?? null,
  );

  const handleBackendSelect = (url: string | null) => {
    setSelectedBackendUrl(url);
    if (url) {
      setBackendUrl(url);
    }
  };

  return (
    <SubPageLayout>
      <PageTitle subpage k="global.pages.register" />
      {step === -1 && (availableBackends.length > 1 || !defaultBackend) ? (
        <LargeCard>
          <LargeCardText title={t("auth.backendSelection.title")}>
            {t("auth.backendSelection.description")}
          </LargeCardText>
          <BackendSelector
            selectedUrl={selectedBackendUrl}
            onSelect={handleBackendSelect}
            availableUrls={availableBackends}
            showCustom
          />
          <LargeCardButtons>
            <span className="text-type-danger font-medium text-center">
              {t("settings.connections.server.notice")}
            </span>
            <Button
              theme="purple"
              onClick={() => {
                if (selectedBackendUrl) {
                  setStep(0);
                }
              }}
              disabled={!selectedBackendUrl}
            >
              {t("auth.register.information.next")}
            </Button>
          </LargeCardButtons>
        </LargeCard>
      ) : null}
      {step === 0 ? (
        <TrustBackendPart
          backendUrl={selectedBackendUrl}
          onNext={() => {
            setStep(1);
          }}
        />
      ) : null}
      {step === 1 ? (
        <AccountCreatePart
          onNext={(a) => {
            setAccount(a);
            setStep(2);
          }}
        />
      ) : null}
      {step === 2 && account ? (
        <LargeCard>
          <LargeCardText title={t("auth.createAccount") || "Account Created"}>
            Your account has been created. You can now sign in.
          </LargeCardText>
          <LargeCardButtons>
            <Button
              theme="purple"
              onClick={() => navigate("/login")}
            >
              {t("auth.login.goToLogin") || "Go to Login"}
            </Button>
          </LargeCardButtons>
        </LargeCard>
      ) : null}
    </SubPageLayout>
  );
}
