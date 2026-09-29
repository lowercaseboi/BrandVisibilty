import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { IMAGE_SIZES } from "../../api/types";
import type { Asset, ChannelStatus, Variant, VariantPatch } from "../../api/types";
import { useFormat, useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { FORMAT_LABEL, MODE_LABEL, channelName, isAdvisory, charBudget, normalizeHashtag, parseHashtags } from "./campaignModel";
import type { SaveState } from "./useDraftSaver";

export function SaveIndicator({ state }: { state: SaveState | undefined }) {
  const t = useT();
  if (!state || state === "idle") return null;
  const key: MessageKey =
    state === "saving" || state === "pending"
      ? "board.campaign.save.saving"
      : state === "saved"
        ? "board.campaign.save.saved"
        : "board.campaign.save.error";
  return (
    <span className={`cs-save cs-save-${state}`} role="status">
      {t(key)}
    </span>
  );
}

function HashtagInput({ tags, onChange, labelId }: { tags: string[]; onChange: (tags: string[]) => void; labelId: string }) {
  const t = useT();
  const [text, setText] = useState("");
  const shown = tags.map(normalizeHashtag).filter(Boolean);

  const add = (raw: string) => {
    const extra = parseHashtags(raw).filter((x) => !shown.some((s) => s.toLowerCase() === x.toLowerCase()));
    if (extra.length) onChange([...shown, ...extra]);
    setText("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || (e.key === " " && text.trim())) {
      e.preventDefault();
      add(text);
    } else if (e.key === "Backspace" && !text && shown.length) {
      onChange(shown.slice(0, -1));
    }
  };

  return (
    <div className="cs-chips">
      {shown.map((tag, i) => (
        <span key={`${tag}-${i}`} className="cs-chip">
          #{tag}
          <button
            type="button"
            aria-label={t("board.campaign.editor.removeTag", { tag })}
            onClick={() => onChange(shown.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        aria-labelledby={labelId}
        value={text}
        placeholder={t("board.campaign.editor.tagPlaceholder")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => text.trim() && add(text)}
      />
    </div>
  );
}

const ISSUE_KEY: Record<string, MessageKey> = {
  empty: "board.campaign.issue.empty",
  over_limit: "board.campaign.issue.overLimit",
};

export interface VariantEditorProps {
  variant: Variant;
  /** Issues computed locally (over limit, empty), on top of the server's variant.issues. */
  localIssues: string[];
  assets: Asset[];
  status: ChannelStatus | undefined;
  statuses: ChannelStatus[];
  saveState: SaveState | undefined;
  locked: boolean;
  onChange: (patch: VariantPatch) => void;
}

/** Copy editor for one channel: on/off, text with a live counter, hashtags, link, image and alt text. */
export function VariantEditor({ variant, localIssues, assets, status, statuses, saveState, locked, onChange }: VariantEditorProps) {
  const t = useT();
  const fmt = useFormat();
  const textId = useId();
  const counterId = useId();
  const tagsLabelId = useId();
  const issuesId = useId();
  const budget = charBudget(variant.channel, variant);
  const name = channelName(variant.channel, statuses);
  const advice = (variant.issues ?? []).filter(isAdvisory);
  const issues = [
    ...(variant.issues ?? []).filter((m) => !isAdvisory(m)),
    ...localIssues.map((k) => (ISSUE_KEY[k] ? t(ISSUE_KEY[k], { limit: fmt.number(budget.limit) }) : k)),
  ];
  const hugeLimit = budget.limit >= 100_000;

  return (
    <section className="cs-editor" aria-label={t("board.campaign.editor.label", { channel: name })}>
      <div className="cs-editor-top">
        <label className="cs-toggle">
          <span className="switch">
            <input
              type="checkbox"
              checked={variant.enabled}
              disabled={locked}
              onChange={(e) => onChange({ enabled: e.target.checked })}
            />
            <span className="switch-track" aria-hidden="true" />
          </span>
          <span>{variant.enabled ? t("board.campaign.editor.on", { channel: name }) : t("board.campaign.editor.off", { channel: name })}</span>
        </label>
        {status && <span className={`cs-mode cs-mode-${status.mode}`}>{t(MODE_LABEL[status.mode])}</span>}
        <SaveIndicator state={saveState} />
      </div>

      <fieldset className="cs-fields" disabled={locked || !variant.enabled}>
        <div className="field">
          <span className="cs-field-head">
            <label htmlFor={textId}>{t("board.campaign.editor.text")}</label>
            <span id={counterId} className={`cs-counter is-${budget.state}`} aria-live="polite">
              {hugeLimit
                ? t("board.campaign.editor.countOnly", { n: fmt.number(budget.count) })
                : t("board.campaign.editor.count", { n: fmt.number(budget.count), limit: fmt.number(budget.limit) })}
            </span>
          </span>
          <textarea
            id={textId}
            rows={variant.channel === "x" ? 4 : 7}
            value={variant.text}
            aria-describedby={`${counterId}${issues.length ? ` ${issuesId}` : ""}`}
            aria-invalid={issues.length > 0 || undefined}
            onChange={(e) => onChange({ text: e.target.value })}
          />
          <span className="field-hint">
            {variant.channel === "x" ? t("board.campaign.editor.countHintX") : t("board.campaign.editor.countHint")}
          </span>
        </div>

        {issues.length > 0 && (
          <ul id={issuesId} className="cs-issues" role="alert">
            {issues.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
        {advice.length > 0 && (
          <div className="cs-advice">
            <p className="eyebrow">{t("board.campaign.editor.advice")}</p>
            <ul>
              {advice.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="field">
          <span id={tagsLabelId}>{t("board.campaign.editor.hashtags")}</span>
          <HashtagInput tags={variant.hashtags ?? []} onChange={(hashtags) => onChange({ hashtags })} labelId={tagsLabelId} />
        </div>

        <div className="cs-row">
          <label className="field">
            {t("board.campaign.editor.link")}
            <input
              type="url"
              inputMode="url"
              placeholder="https://"
              value={variant.link ?? ""}
              onChange={(e) => onChange({ link: e.target.value || null })}
            />
          </label>
          <label className="field">
            {t("board.campaign.editor.image")}
            <select value={variant.asset_id ?? ""} onChange={(e) => onChange({ asset_id: e.target.value || null })}>
              <option value="">{t("board.campaign.editor.imageAuto")}</option>
              {assets.map((a) => (
                <option key={a.asset_id} value={a.asset_id}>
                  {t(FORMAT_LABEL[a.format])} · {IMAGE_SIZES[a.format]?.join("×")} · {a.provider}
                  {a.seed != null ? ` · #${a.seed}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          {t("board.campaign.editor.alt")}
          <input
            value={variant.alt_text ?? ""}
            placeholder={t("board.campaign.editor.altPlaceholder")}
            onChange={(e) => onChange({ alt_text: e.target.value || null })}
          />
        </label>
      </fieldset>
    </section>
  );
}
