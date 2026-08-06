import { Link } from "react-router-dom";
import { LegalDocument } from "./LegalDocument";
import { SITE } from "../../lib/site";

const UPDATED = "August 4, 2026";

export function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Use"
      description={`Rules for using ${SITE.name}, a link-based movie and TV discovery catalog that does not host media files.`}
      path="/terms"
      updated={UPDATED}
      sections={[
        {
          id: "acceptance",
          title: "Acceptance",
          body: (
            <p>
              By accessing or using {SITE.name}, you agree to these Terms of
              Use and our{" "}
              <Link to="/privacy">Privacy Policy</Link>. If you do not agree, do
              not use the service.
            </p>
          ),
        },
        {
          id: "service",
          title: "Description of the service",
          body: (
            <>
              <p>
                {SITE.name} provides a browsing experience for movie and TV
                metadata and may surface links or embeds to third-party
                sources.{" "}
                <strong>
                  We do not own, license, upload, store, or host audiovisual
                  media files.
                </strong>{" "}
                We operate an index / discovery layer — not a media hosting
                platform.
              </p>
              <p>
                Availability of any third-party stream is outside our control.
                Links may break, move, or be geo-restricted without notice.
              </p>
            </>
          ),
        },
        {
          id: "user",
          title: "Your responsibilities",
          body: (
            <>
              <p>You agree that you will:</p>
              <ul>
                <li>
                  Comply with all laws that apply to you, including copyright
                  and local streaming regulations in your country.
                </li>
                <li>
                  Not use {SITE.name} to engage in copyright infringement or
                  other unlawful activity.
                </li>
                <li>
                  Not attempt to scrape, overload, reverse engineer, or disrupt
                  our infrastructure beyond ordinary browsing.
                </li>
                <li>
                  Not misrepresent yourself when submitting legal or support
                  requests.
                </li>
              </ul>
              <p>
                You are solely responsible for how you interact with
                third-party websites and players opened from our pages.
              </p>
            </>
          ),
        },
        {
          id: "ip",
          title: "Intellectual property",
          body: (
            <p>
              Site design, branding, and original text on {SITE.name} are
              owned by us or our licensors. Third-party titles, artwork,
              trademarks, and footage remain owned by their respective rights
              holders. Catalog metadata may come from public APIs under those
              providers’ terms. See our{" "}
              <Link to="/dmca">DMCA &amp; Copyright Policy</Link> for infringement
              complaints about indexed links.
            </p>
          ),
        },
        {
          id: "disclaimer",
          title: "Disclaimers",
          body: (
            <>
              <p>
                THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT
                WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
                MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
                NON-INFRINGEMENT.
              </p>
              <p>
                We do not warrant that third-party links or embeds are lawful
                in your jurisdiction, free of malware, or continuous. You
                access third-party content at your own risk.
              </p>
            </>
          ),
        },
        {
          id: "liability",
          title: "Limitation of liability",
          body: (
            <p>
              To the fullest extent permitted by law, {SITE.legalName} and its
              operators shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages, or any loss of
              data, profits, or goodwill, arising from your use of the service
              or any third-party content accessed through it.
            </p>
          ),
        },
        {
          id: "indemnity",
          title: "Indemnity",
          body: (
            <p>
              You agree to defend and indemnify {SITE.legalName} against claims
              arising from your misuse of the service or your violation of
              these terms or applicable law.
            </p>
          ),
        },
        {
          id: "changes-terms",
          title: "Changes to the service or terms",
          body: (
            <p>
              We may modify or discontinue features at any time. We may update
              these terms; the “Last updated” date will reflect changes.
              Continued use after changes means you accept the updated terms
              where allowed by law.
            </p>
          ),
        },
        {
          id: "law",
          title: "Governing law",
          body: (
            <p>
              These terms are governed by the laws applicable to the operators
              of {SITE.name}, without regard to conflict-of-law principles.
              Courts in that jurisdiction shall have exclusive venue, except
              where mandatory consumer protections provide otherwise.
            </p>
          ),
        },
        {
          id: "contact-terms",
          title: "Contact",
          body: (
            <p>
              Questions about these terms:{" "}
              <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.
              Copyright:{" "}
              <a href={`mailto:${SITE.legalEmail}`}>{SITE.legalEmail}</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
