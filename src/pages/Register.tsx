import { useEffect, useState } from "react";
import { GoogleReCaptchaProvider } from "react-google-recaptcha-v3";
import { useNavigate } from "react-router-dom";
import { useAsync } from "react-use";

import { SubPageLayout } from "@/pages/layouts/SubPageLayout";
import { CredentialsCreatePart } from "@/pages/parts/auth/CredentialsCreatePart";
import { PassphraseDisplayPart } from "@/pages/parts/auth/PassphraseDisplayPart";
import { PageTitle } from "@/pages/parts/util/PageTitle";
import { useAuthStore } from "@/stores/auth";
import { conf } from "@/setup/config";
import { getBackendMeta } from "@/backend/accounts/meta";
import { Loading } from "@/components/layout/Loading";

interface RegistrationData {
  mnemonic: string;
  username: string;
}

function CaptchaProvider(props: { siteKey: string | null; children: React.ReactNode }) {
  if (!props.siteKey) return props.children as JSX.Element;
  return (
    <GoogleReCaptchaProvider
      reCaptchaKey={props.siteKey}
      language="en"
    >
      {props.children}
    </GoogleReCaptchaProvider>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const setBackendUrl = useAuthStore((s) => s.setBackendUrl);
  const backendUrl = conf().BACKEND_URL;
  
  useEffect(() => {
    if (backendUrl) {
      setBackendUrl(backendUrl);
    }
  }, [setBackendUrl, backendUrl]);

  const [step, setStep] = useState(1);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  
  const metaResult = useAsync(() => {
    if (!backendUrl) return Promise.resolve(null);
    return getBackendMeta(backendUrl);
  }, [backendUrl]);

  useEffect(() => {
    if (metaResult.value) {
      setSiteKey(
        metaResult.value.hasCaptcha && metaResult.value.captchaClientKey
          ? metaResult.value.captchaClientKey
          : null
      );
    }
  }, [metaResult.value]);

  const [registrationData, setRegistrationData] = useState<RegistrationData>({
    mnemonic: "",
    username: "",
  });

  return (
    <CaptchaProvider siteKey={siteKey}>
      <SubPageLayout>
        <PageTitle subpage k="global.pages.register" />
        
        {metaResult.loading && <div className="flex justify-center items-center py-12"><Loading /></div>}
        
        {!metaResult.loading && step === 1 ? (
          <CredentialsCreatePart
            hasCaptcha={!!siteKey}
            onNext={(data) => {
              setRegistrationData({
                mnemonic: data.mnemonic,
                username: data.username,
              });
              setStep(2);
            }}
          />
        ) : null}
        
        {!metaResult.loading && step === 2 ? (
          <PassphraseDisplayPart
            mnemonic={registrationData.mnemonic}
            username={registrationData.username}
            onNext={() => {
              navigate("/");
            }}
          />
        ) : null}
      </SubPageLayout>
    </CaptchaProvider>
  );
}
