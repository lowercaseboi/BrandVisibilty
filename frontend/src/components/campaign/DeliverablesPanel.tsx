import { useId, useState } from "react";
import type { Deliverable, DeliverableKind, DeliverablePatch } from "../../api/types";
import { useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
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

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <button
      type="button"
      className="btn btn-secondary btn-small"
      onClick={async () => {
        const ok = await copyText(text);
        setState(ok ? "ok" : "fail");
        window.setTimeout(() => setState("idle"), 1600);
      }}
    >
      {state === "ok" ? t("board.campaign.copied") : state === "fail" ? t("board.campaign.copyFailed") : label}
    </button>
  );
}

function DeliverableItem({
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
  const extras = Object.entries(d.extra ?? {}).filter(([k, v]) => k !== "jsonld" && !!v);
  return (
    <li className="cs-deliverable">
      <div className="cs-deliverable-head">
        <span className="badge badge-accent">{KIND_LABEL[d.kind] ? t(KIND_LABEL[d.kind]) : d.kind}</span>
        <SaveIndicator state={saveState} />
      </div>
      <fieldset className="cs-fields" disabled={disabled}>
        <label className="field">
          {t("board.campaign.deliverables.titleField")}
          <input value={d.title} onChange={(e) => onChange(index, { title: e.target.value })} />
        </label>
        <div className="field">
          <span className="cs-field-head">
            <label htmlFor={bodyId}>{t("board.campaign.deliverables.body")}</label>
            <CopyButton text={d.body} label={t("board.campaign.deliverables.copy")} />
          </span>
          <textarea
            id={bodyId}
            className="cs-markdown"
            rows={Math.min(18, Math.max(6, d.body.split("\n").length + 1))}
            value={d.body}
            onChange={(e) => onChange(index, { body: e.target.value })}
          />
        </div>
      </fieldset>
      {d.extra?.jsonld && (
        <div className="cs-jsonld">
          <span className="cs-field-head">
            <span className="eyebrow">{t("board.campaign.deliverables.jsonld")}</span>
            <CopyButton text={d.extra.jsonld} label={t("board.campaign.deliverables.copyJsonld")} />
          </span>
          <pre>
            <code>{d.extra.jsonld}</code>
          </pre>
          <p className="field-hint">{t("board.campaign.deliverables.jsonldHint")}</p>
        </div>
      )}
      {extras.length > 0 && (
        <dl className="cs-extras">
          {extras.map(([k, v]) => (
            <div key={k}>
              <dt className="eyebrow">{k.replace(/_/g, " ")}</dt>
              <dd>{/^https?:\/\//.test(v) ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : v}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

/** The kit's text deliverables (article, FAQ + JSON-LD, profile copy…): editable markdown to paste into a site or profile. */
export function DeliverablesPanel({
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
  const headingId = useId();
  if (deliverables.length === 0) return null;
  return (
    <section className="card cs-panel" aria-labelledby={headingId}>
      <div className="cs-panel-head">
        <h2 id={headingId}>{t("board.campaign.deliverables.title")}</h2>
        <p className="muted small">{t("board.campaign.deliverables.intro")}</p>
      </div>
      <ul className="cs-deliverables">
        {deliverables.map((d, i) => (
          <DeliverableItem key={i} d={d} index={i} saveState={states[`d${i}`]} disabled={disabled} onChange={onChange} />
        ))}
      </ul>
    </section>
  );
}
