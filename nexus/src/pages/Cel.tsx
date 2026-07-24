import { ThinContainer } from "@/components/layout/ThinContainer";
import { Heading1, Paragraph } from "@/components/utils/Text";
import { PageTitle } from "@/pages/parts/util/PageTitle";

import { SubPageLayout } from "./layouts/SubPageLayout";


export function CelPage() {
  return (
    <SubPageLayout>
      <PageTitle subpage k="global.pages.cel" />
      <ThinContainer>
        <Heading1>Mükemmel bi&apos; film tadında</Heading1>
        <Paragraph className="flex flex-col gap-6">
          <span style={{ color: "#cfcfcf" }}>
            sen ve ben, karanlıkta - onca yıldızın içinde
          </span>
        </Paragraph>
      </ThinContainer>
    </SubPageLayout>
  );
}
