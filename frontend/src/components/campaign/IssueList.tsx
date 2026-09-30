import { useFormat, useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { fixFor, parseIssue } from "./studioFlow";
import type { IssueView } from "./studioFlow";

const SENTENCE: Record<IssueView["kind"], MessageKey | null> = {
  claim: "board.campaign.issue.claim",
  hashtag_claim: "board.campaign.issue.hashtagClaim",
  too_many_tags: "board.campaign.issue.tooManyTags",
  empty: "board.campaign.issue.empty",
  too_long: "board.campaign.issue.overLimit",
  placeholder: "board.campaign.issue.placeholder",
  competitor: "board.campaign.issue.competitor",
  removed_tag: "board.campaign.issue.removedTag",
  shortened: "board.campaign.issue.shortened",
  other: null,
};

/**
 * Server and local issues as plain sentences, with a one-click fix where the issue names words
 * found in the text ("Remove this phrase") or a hashtag in the list ("Remove this hashtag").
 * Blocking issues first; advice ("check before posting") in a softer list.
 */
export function IssueList({
  issues,
  text,
  hashtags,
  limit,
  id,
  disabled,
  onRemovePhrase,
  onRemoveHashtag,
}: {
  issues: string[];
  text: string;
  hashtags?: string[];
  /** The channel's character limit, for the local "over_limit" key. */
  limit?: number;
  id?: string;
  disabled?: boolean;
  onRemovePhrase?: (phrase: string) => void;
  onRemoveHashtag?: (tag: string) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const views = issues.map(parseIssue);
  const blocking = views.filter((v) => !v.advisory);
  const advice = views.filter((v) => v.advisory);

  const sentence = (v: IssueView) => {
    const key = v.kind === "too_many_tags" && v.n === 0 ? "board.campaign.issue.noTags" : SENTENCE[v.kind];
    if (!key) return v.raw;
    return t(key, {
      phrase: v.phrase ?? "",
      n: fmt.number(v.n ?? 0),
      limit: fmt.number(v.limit ?? limit ?? 0),
    });
  };

  const row = (v: IssueView, i: number) => {
    const fix = fixFor(v, text, hashtags);
    return (
      <li key={i}>
        <span>{sentence(v)}</span>
        {fix === "phrase" && onRemovePhrase && (
          <button
            type="button"
            className="btn btn-secondary btn-small"
            disabled={disabled}
            aria-label={t("board.campaign.issue.removePhraseLabel", { phrase: v.phrase ?? "" })}
            onClick={() => onRemovePhrase(v.phrase ?? "")}
          >
            {t("board.campaign.issue.removePhrase")}
          </button>
        )}
        {fix === "hashtag" && onRemoveHashtag && (
          <button type="button" className="btn btn-secondary btn-small" disabled={disabled} onClick={() => onRemoveHashtag(v.phrase ?? "")}>
            {t("board.campaign.issue.removeTag")}
          </button>
        )}
      </li>
    );
  };

  if (views.length === 0) return null;
  return (
    <div className="cs-issues" id={id}>
      {blocking.length > 0 && (
        <div className="cs-issue-box is-err" role="alert">
          <p className="eyebrow">{t.n("board.campaign.issues.title", blocking.length)}</p>
          <ul>{blocking.map(row)}</ul>
        </div>
      )}
      {advice.length > 0 && (
        <div className="cs-issue-box is-warn">
          <p className="eyebrow">{t("board.campaign.editor.advice")}</p>
          <ul>{advice.map(row)}</ul>
        </div>
      )}
    </div>
  );
}
