import { useId, useState } from "react";
import type { Deliverable, DeliverableKind, DeliverablePatch } from "../../api/types";
import { useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { IssueList } from "./IssueList";
import { containsPhrase, parseIssue, removePhrase } from "./studioFlow";
import { SaveIndicator } from "./VariantEditor";
import type { SaveState } from "./useDraftSaver";

const KIND_LABEL: Record<DeliverableKind, MessageKey> = {
  social_post: "board.campaign.kind.social_post",
  article: "board.campaign.kind.article",
  faq: "board.campaign.kind.faq",
  profile_copy: "board.campaign.kind.profile_copy",
  video_script: "board.campaign.kind.video_script",
  review_request: "board.campaign.kind.review_request",
  listing: "board.campaign.kind.listing",
  outreach_email: "board.campaign.kind.outreach_email",
  community_answer: "board.campaign.kind.community_answer",
};

/** Where each piece goes, in one short line. */
const WHERE: Record<DeliverableKind, MessageKey> = {
  social_post: "board.campaign.web.where.social_post",
  article: "board.campaign.web.where.article",
  faq: "board.campaign.web.where.faq",
  profile_copy: "board.campaign.web.where.profile_copy",
  video_script: "board.campaign.web.where.video_script",
  review_request: "board.campaign.web.where.review_request",
  listing: "board.campaign.web.where.listing",
  outreach_email: "board.campaign.web.where.outreach_email",
  community_answer: "board.campaign.web.where.community_answer",
};

export function CopyButton({ text, label, primary = false }: { text: string; label: string; primary?: boolean }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <button
      type="button"
      className={`btn ${primary ? "btn-primary" : "btn-secondary"} btn-small`}
      onClick={async () => {
        let ok = true;
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          ok = false;
        }
        setState(ok ? "ok" : "fail");
        window.setTimeout(() => setState("idle"), 1600);
      }}
    >
      <span aria-live="polite">{state === "ok" ? t("board.campaign.copied") : state === "fail" ? t("board.campaign.copyFailed") : label}</span>
    </button>
  );
}

function Piece({
  d,
  index,
  saveState,
  disabled,
  onChange,
}: {
  d: Deliverable;
  index: number;
  saveState: SaveState | undefined;
  disabled: boolean;
  onChange: (index: number, patch: DeliverablePatch) => void;
}) {
  const t = useT();
  const bodyId = useId();
  // The backend's claim check lists unsupported numbers / superlatives in this text under
  // extra.claim_issues (newline-joined), checked when drafted: one whose words are gone is fixed.
  const claims = (d.extra?.claim_issues ?? "")
    .split("\n")
    .filter(Boolean)
    .filter((m) => {
      const v = parseIssue(m);
      return v.kind !== "claim" || !v.phrase || containsPhrase(`${d.title}\n${d.body}`, v.phrase);
    });
  const extras = Object.entries(d.extra ?? {}).filter(([k, v]) => !["jsonld", "claim_issues", "qr_asset_id"].includes(k) && !!v);
  return (
    <li className="card cs-piece">
      <div className="field-head">
        <span className="badge badge-accent">{KIND_LABEL[d.kind] ? t(KIND_LABEL[d.kind]) : d.kind}</span>
        <SaveIndicator state={saveState} />
      </div>
      <p className="cs-paste">{WHERE[d.kind] ? t(WHERE[d.kind]) : t("board.campaign.web.where.other")}</p>
      <fieldset className="field-group" disabled={disabled}>
        <label className="field">
          {t("board.campaign.web.titleField")}
          <input value={d.title} onChange={(e) => onChange(index, { title: e.target.value })} />
        </label>
        <div className="field">
          <span className="field-head">
            <label htmlFor={bodyId}>{t("board.campaign.web.body")}</label>
            <CopyButton text={d.title ? `${d.title}\n\n${d.body}` : d.body} label={t("board.campaign.web.copy")} primary />
          </span>
          <textarea
            id={bodyId}
            className="cs-markdown"
            rows={Math.min(16, Math.max(6, d.body.split("\n").length + 1))}
            value={d.body}
            onChange={(e) => onChange(index, { body: e.target.value })}
          />
        </div>
      </fieldset>
      <IssueList issues={claims} text={d.body} disabled={disabled} onRemovePhrase={(phrase) => onChange(index, { body: removePhrase(d.body, phrase) })} />
      {d.extra?.jsonld && (
        <div className="cs-code">
          <span className="field-head">
            <span className="eyebrow">{t("board.campaign.web.jsonld")}</span>
            <CopyButton text={d.extra.jsonld} label={t("board.campaign.web.copyJsonld")} />
          </span>
          <pre>
            <code>{d.extra.jsonld}</code>
          </pre>
          <p className="field-hint">{t("board.campaign.web.jsonldHint")}</p>
        </div>
      )}
      {extras.length > 0 && (
        <dl className="cs-extras">
          {extras.map(([k, v]) => (
            <div key={k}>
              <dt className="eyebrow">{k.replace(/_/g, " ")}</dt>
              <dd>
                {/^https?:\/\//.test(v) ? (
                  <a href={v} target="_blank" rel="noreferrer">
                    {v}
                  </a>
                ) : (
                  v
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

/** The kit's text for websites and profiles (article, FAQ + JSON-LD, profile copy…): edit, copy, paste. */
export function WebsiteText({
  deliverables,
  states,
  disabled,
  onChange,
}: {
  deliverables: Deliverable[];
  states: Record<string, SaveState>;
  disabled: boolean;
  onChange: (index: number, patch: DeliverablePatch) => void;
}) {
  const t = useT();
  return (
    <div className="cs-web">
      <p className="muted">{t("board.campaign.web.intro")}</p>
      {deliverables.length === 0 ? (
        <p className="muted small">{t("board.campaign.web.none")}</p>
      ) : (
        <ul className="cs-pieces">
          {deliverables.map((d, i) => (
            <Piece key={i} d={d} index={i} saveState={states[`d${i}`]} disabled={disabled} onChange={onChange} />
          ))}
        </ul>
      )}
    </div>
  );
}
