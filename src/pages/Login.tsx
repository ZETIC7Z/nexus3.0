import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { SubPageLayout } from "@/pages/layouts/SubPageLayout";
import { LoginFormPart } from "@/pages/parts/auth/LoginFormPart";
import { PageTitle } from "@/pages/parts/util/PageTitle";
import { conf } from "@/setup/config";
import { useAuthStore } from "@/stores/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const setBackendUrl = useAuthStore((s) => s.setBackendUrl);
  
  useEffect(() => {
    if (conf().BACKEND_URL) {
      setBackendUrl(conf().BACKEND_URL);
    }
  }, [setBackendUrl]);

  return (
    <SubPageLayout>
      <PageTitle subpage k="global.pages.login" />
      <LoginFormPart
        onLogin={() => {
          navigate("/profiles");
        }}
      />
    </SubPageLayout>
  );
}
