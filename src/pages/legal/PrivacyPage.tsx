import { LegalDocument } from "./LegalDocument";
import { SITE } from "../../lib/site";

const UPDATED = "August 4, 2026";

export function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      description={`How ${SITE.name} handles information when you use our movie and TV discovery catalog.`}
      path="/privacy"
      updated={UPDATED}
      sections={[
        {
          id: "overview",
          title: "Overview",
          body: (
            <>
              <p>
                {SITE.name} (“we”, “us”) provides a catalog and link index for
                discovering movies and TV shows. We do not require an account
                to browse. We do not host video files; third-party players or
                links may collect their own data under their own policies.
              </p>
              <p>
                This policy describes information related to our own website
                and servers — not the privacy practices of external streaming
                sources.
              </p>
            </>
          ),
        },
        {
          id: "collect",
          title: "Information we may collect",
          body: (
            <>
              <p>Depending on how you use the site, we may process:</p>
              <ul>
                <li>
                  <strong>Technical logs:</strong> IP address, browser type,
                  device type, referring URL, pages viewed, and timestamps —
                  typical server and CDN logs used for security and
                  reliability.
                </li>
                <li>
                  <strong>Local preferences:</strong> data stored in your
                  browser (for example localStorage) such as UI state. This
                  stays on your device unless you clear it.
                </li>
                <li>
                  <strong>Communications:</strong> if you email{" "}
                  {SITE.legalEmail} or {SITE.supportEmail}, we keep the
                  contents needed to respond (for example a DMCA notice).
                </li>
              </ul>
              <p>
                We do not intentionally collect sensitive personal data, and
                we do not sell personal information.
              </p>
            </>
          ),
        },
        {
          id: "cookies",
          title: "Cookies and similar technologies",
          body: (
            <p>
              We may use essential cookies or local storage required for the
              site to function (routing, session integrity, preference
              storage). If analytics or advertising tools are added later,
              this policy will be updated and, where required, consent
              mechanisms will be provided.
            </p>
          ),
        },
        {
          id: "use",
          title: "How we use information",
          body: (
            <ul>
              <li>Operate, secure, and improve the catalog and link index.</li>
              <li>Respond to legal, DMCA, and support requests.</li>
              <li>Detect abuse, fraud, and technical issues.</li>
              <li>Comply with applicable law.</li>
            </ul>
          ),
        },
        {
          id: "third",
          title: "Third-party services",
          body: (
            <>
              <p>
                Metadata and images may be loaded from third-party providers
                (for example TMDB or image CDNs). Embedded players and outbound
                links are operated by others. When you interact with those
                services, their privacy policies apply.
              </p>
              <p>
                Because we do not host the underlying media, we cannot control
                trackers or ads that third-party players may inject.
              </p>
            </>
          ),
        },
        {
          id: "retention",
          title: "Retention",
          body: (
            <p>
              Logs are retained only as long as reasonably needed for
              security, operations, and legal compliance. Email correspondence
              related to copyright notices may be retained as needed to
              document our response.
            </p>
          ),
        },
        {
          id: "rights",
          title: "Your choices",
          body: (
            <p>
              You can clear cookies and local storage in your browser. You may
              contact us at{" "}
              <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>{" "}
              to ask about access or deletion of personal data we hold about
              you in our emails or logs, subject to legal exceptions.
            </p>
          ),
        },
        {
          id: "children",
          title: "Children",
          body: (
            <p>
              The service is not directed at children under 13 (or the minimum
              age required in your jurisdiction). We do not knowingly collect
              personal information from children.
            </p>
          ),
        },
        {
          id: "changes",
          title: "Changes",
          body: (
            <p>
              We may update this policy from time to time. The “Last updated”
              date at the top of this page will change when we do. Continued
              use of the site after updates constitutes acceptance of the
              revised policy where permitted by law.
            </p>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          body: (
            <p>
              Privacy questions:{" "}
              <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.
              Copyright notices:{" "}
              <a href={`mailto:${SITE.legalEmail}`}>{SITE.legalEmail}</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
