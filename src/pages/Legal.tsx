import classNames from "classnames";
import React from "react";

import { Icon, Icons } from "@/components/Icon";
import { BiggerCenterContainer } from "@/components/layout/ThinContainer";
import {
  Heading1,
  Heading2,
  Heading3,
  Paragraph,
} from "@/components/utils/Text";
import { PageTitle } from "@/pages/parts/util/PageTitle";
import { conf } from "@/setup/config";

import { SubPageLayout } from "./layouts/SubPageLayout";
import { Link } from "./onboarding/utils";

export function shouldHaveLegalPage() {
  return !!conf().DMCA_EMAIL;
}

function LegalCard(props: {
  icon: Icons;
  subtitle: string;
  title: string;
  description: React.ReactNode;
  colorClass: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-onboarding-card/40 duration-300 border border-onboarding-border rounded-lg p-7">
      <div>
        <Icon
          icon={props.icon}
          className={classNames("text-4xl mb-6 block", props.colorClass)}
        />
        <Heading3
          className={classNames(
            "!mt-0 !mb-0 !text-xs uppercase",
            props.colorClass,
          )}
        >
          {props.subtitle}
        </Heading3>
        <Heading2 className="!mb-0 !mt-1 !text-base">{props.title}</Heading2>
        <div className="!my-4 space-y-3 text-gray-300">{props.description}</div>
      </div>
      <div>{props.children}</div>
    </div>
  );
}

export function LegalPage() {
  return (
    <SubPageLayout>
      <PageTitle subpage k="global.pages.legal" />
      <BiggerCenterContainer classNames="!pt-0">
        <Heading1>DMCA + Legal Information</Heading1>
        <Paragraph className="text-gray-400 text-lg mb-8">
          Important information about our service, content policies, and user
          responsibilities.
        </Paragraph>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          <LegalCard
            icon={Icons.SEARCH}
            subtitle="Service Model"
            title="How We Operate"
            colorClass="text-blue-400"
            description={
              <>
                <Paragraph>
                  NEXUS functions as a search engine and content aggregator
                  that indexes publicly available media from across the
                  internet.
                  <br />
                  <br />
                  We don&apos;t host, store, or control any media files -
                  everything is sourced from external third-party websites that
                  are already publicly accessible.
                  <br />
                  <br />
                  Our automated systems simply provide links to content
                  that&apos;s already available online, without bypassing any
                  security measures.
                </Paragraph>
                <Link to="/about">Learn more about how NEXUS works</Link>
              </>
            }
          />

          <LegalCard
            icon={Icons.CIRCLE_CHECK}
            subtitle="Copyright Policy"
            title="Content & Copyright"
            colorClass="text-green-400"
            description={
              <Paragraph>
                We&apos;re a search index. The actual video files live on
                third-party hosts that we don&apos;t own and don&apos;t
                control — we just point at them. If a file disappears
                unexus, our link breaks the same day. The host is the only
                party who can take a file down.
                <br />
                <br />
                That said, we don&apos;t want to make life harder for rights
                holders. If you own the rights to a title and send us a
                notice with enough detail to identify it, we&apos;ll delist
                it from our search so it can&apos;t be reached from anywhere
                on the site — and we&apos;ll happily tell you exactly which
                unexus sources we were pulling it from, so you can chase
                the files at their actual source.
                <br />
                <br />
                Blocking a title here won&apos;t make it disappear from the
                internet — it only stops users from finding it through us.
                But that&apos;s the part we control, and we&apos;ll act on it
                in good faith.
              </Paragraph>
            }
          />

          <LegalCard
            icon={Icons.EYE_SLASH}
            subtitle="Data Protection"
            title="Privacy & Data"
            colorClass="text-purple-400"
            description={
              <Paragraph>
                User privacy is important to us. We don&apos;t collect, store,
                or track any personal information about our users.
                <br />
                <br />
                Optionally, users can store their bookmarks and watch history in
                our encrypted backend. But we don&apos;t store any personal
                information or identifying data.
                <br />
                <br />
                NEXUS is entirely self hostable, and can be run on any
                server. Even by yourself.
              </Paragraph>
            }
          />

          <LegalCard
            icon={Icons.USER}
            subtitle="User Responsibilities"
            title="User Guidelines"
            colorClass="text-yellow-400"
            description={
              <Paragraph>
                Users are responsible for ensuring their access complies with
                local laws and regulations in their jurisdiction.
                <br />
                <br />
                We strongly recommend using VPN services for enhanced privacy
                and security while browsing. Downloading is not advised.
                <br />
                <br />
                Please respect intellectual property rights and be mindful of
                copyright laws in your area.
              </Paragraph>
            }
          />

          <LegalCard
            icon={Icons.WARNING}
            subtitle="Terms & Conditions"
            title="Service Terms"
            colorClass="text-red-400"
            description={
              <Paragraph>
                NEXUS is licensed under the MIT license.
                <br />
                <br />
                By using our platform, you acknowledge these terms and agree
                that we&apos;re not responsible for third-party content.
                <br />
                <br />
                We operate in good faith compliance with applicable laws and
                regulations. We are not liable for any damages or losses
                incurred while using our service.
              </Paragraph>
            }
          />

          <LegalCard
            icon={Icons.MAIL}
            subtitle="Legal Contact"
            title="Legal Inquiries"
            colorClass="text-cyan-400"
            description={
              <Paragraph>
                For DMCA notices, takedown requests, or anything else
                legal-related, email the address below.
                <br />
                <br />
                To help us turn things around quickly, include the title and
                year, an IMDB or TMDB ID if you have one, and a brief
                statement that you own the rights (or are authorised to act
                for the rights holder). Once we&apos;ve confirmed the claim,
                we&apos;ll delist the title from our search and reply with
                the unexus hosts we were pointing at — so you can pursue
                the actual files at their source.
                <br />
                <br />
                We try to acknowledge requests within a couple of days. Good
                faith on both sides goes a long way.
              </Paragraph>
            }
          >
            {conf().DMCA_EMAIL && (
              <div className="flex space-x-3 items-center pt-4">
                <Icon icon={Icons.MAIL} className="text-white" />
                <span className="text-gray-300">Contact: </span>
                <a
                  href={`mailto:${conf().DMCA_EMAIL}`}
                  className="text-type-link hover:text-white transition-colors duration-300"
                >
                  {conf().DMCA_EMAIL}
                </a>
              </div>
            )}
          </LegalCard>
        </div>
      </BiggerCenterContainer>
    </SubPageLayout>
  );
}
