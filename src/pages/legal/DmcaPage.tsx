import { LegalDocument } from "./LegalDocument";
import { SITE } from "../../lib/site";

const UPDATED = "August 4, 2026";

export function DmcaPage() {
  return (
    <LegalDocument
      title="DMCA & Copyright Policy"
      description={`${SITE.name} respects intellectual property. Because we only index links and metadata — and do not host media files — copyright complaints are handled as delisting requests for indexed references.`}
      path="/dmca"
      updated={UPDATED}
      sections={[
        {
          id: "position",
          title: "Our position on copyrighted media",
          body: (
            <>
              <p>
                <strong>
                  {SITE.name} does not own, control, upload, store, cache, or
                  host any movie, TV episode, or other audiovisual media files.
                </strong>{" "}
                Our catalog shows publicly available metadata (titles,
                posters, synopses, cast, and similar information) and may
                display or embed links or players that point to content hosted
                by independent third parties.
              </p>
              <p>
                We are not a pirate streaming host. We do not operate a media
                CDN for films or shows. If a link or embed becomes unavailable,
                that is controlled by the third-party source — not by files on
                our servers.
              </p>
              <p>
                This policy is aligned with common link-index / aggregator
                practices, including the approach outlined on{" "}
                <a
                  href="https://zstream.mov/legal"
                  rel="noopener noreferrer"
                >
                  zstream.mov/legal
                </a>
                : rights holders may request that specific indexed references
                be removed from our index.
              </p>
            </>
          ),
        },
        {
          id: "what-we-can-do",
          title: "What we can and cannot remove",
          body: (
            <>
              <p>Upon a valid notice, we may:</p>
              <ul>
                <li>
                  Delist or disable links, embeds, or catalog entries that
                  reference allegedly infringing material.
                </li>
                <li>
                  Remove or suppress metadata pages that primarily exist to
                  surface those references.
                </li>
              </ul>
              <p>We cannot:</p>
              <ul>
                <li>
                  Delete video files from third-party websites or networks we
                  do not operate.
                </li>
                <li>
                  Control how independent sites choose to host or distribute
                  content.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "notice",
          title: "How to submit a DMCA / takedown notice",
          body: (
            <>
              <p>
                If you are a copyright owner (or an authorized agent) and
                believe material indexed by {SITE.name} infringes your rights,
                email{" "}
                <a href={`mailto:${SITE.legalEmail}`}>{SITE.legalEmail}</a>{" "}
                with the subject line <strong>DMCA / Copyright Notice</strong>{" "}
                and include all of the following:
              </p>
              <ol>
                <li>
                  Identification of the copyrighted work claimed to have been
                  infringed (title, year, and if available an IMDb or TMDB ID).
                </li>
                <li>
                  The exact URL(s) on {SITE.name} where the material appears
                  (for example a <code>/title/…</code> or watch page).
                </li>
                <li>
                  Your full legal name, mailing address, telephone number, and
                  email address.
                </li>
                <li>
                  A statement that you have a good-faith belief that use of the
                  material in the manner complained of is not authorized by the
                  copyright owner, its agent, or the law.
                </li>
                <li>
                  A statement that the information in the notice is accurate,
                  and under penalty of perjury, that you are authorized to act
                  on behalf of the owner of an exclusive right that is
                  allegedly infringed.
                </li>
                <li>
                  A physical or electronic signature of the copyright owner or
                  authorized agent (typing your full name is acceptable for
                  email).
                </li>
              </ol>
              <p>
                Incomplete notices may delay processing. We review good-faith
                notices and aim to delist qualifying indexed references
                promptly.
              </p>
            </>
          ),
        },
        {
          id: "counter",
          title: "Counter-notification",
          body: (
            <>
              <p>
                If you believe material you submitted or that was delisted was
                removed by mistake or misidentification, you may send a
                counter-notification to{" "}
                <a href={`mailto:${SITE.legalEmail}`}>{SITE.legalEmail}</a>{" "}
                including identification of the material and its former
                location, your contact information, consent to jurisdiction of
                an appropriate court, and a statement under penalty of perjury
                that you have a good-faith belief the material was removed or
                disabled as a result of mistake or misidentification.
              </p>
            </>
          ),
        },
        {
          id: "repeat",
          title: "Repeat infringement",
          body: (
            <p>
              We may limit or terminate access for users or sources that
              repeatedly cause valid infringement complaints related to
              indexed material, to the extent such measures are technically
              and operationally available to a link-index service.
            </p>
          ),
        },
        {
          id: "trademark",
          title: "Trademarks & brand names",
          body: (
            <p>
              Movie and show titles, artwork, and trademarks remain the
              property of their respective owners. Appearance in our catalog
              does not imply endorsement, affiliation, or sponsorship by those
              rights holders. Metadata may be sourced from public databases
              (for example TMDB) under their applicable terms.
            </p>
          ),
        },
      ]}
    />
  );
}
