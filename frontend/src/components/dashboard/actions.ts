// Plain, translated title + concrete steps for each recommendation action id
// (the closed vocabulary in backend/src/app/recommendation/engine.py ACTION_LABEL).
import type { MessageKey } from "../../i18n";

export interface ActionCopy {
  title: MessageKey;
  /** Used when the title needs a competitor name and the gap doesn't have one. */
  titleGeneric?: MessageKey;
  steps: MessageKey[];
}

function steps(action: string): MessageKey[] {
  return [1, 2, 3].map((i) => `dashboard.action.${action}.step${i}` as MessageKey);
}

const ACTIONS = [
  "submit_to_directory",
  "seek_review_coverage",
  "pitch_listicle",
  "faq_page",
  "community_answer",
  "comparison_page",
  "use_case_page",
  "add_attribute_claim",
  "clarify_category_descriptor",
  "correct_outdated_description",
  "video",
] as const;

const COPY: Record<string, ActionCopy> = Object.fromEntries(
  ACTIONS.map((a) => [
    a,
    {
      title: `dashboard.action.${a}.title` as MessageKey,
      titleGeneric: a === "comparison_page" ? ("dashboard.action.comparison_page.titleGeneric" as MessageKey) : undefined,
      steps: steps(a),
    },
  ]),
);

/** null for an action id the frontend doesn't know yet (the caller falls back to backend text). */
export function actionCopy(action: string): ActionCopy | null {
  return COPY[action] ?? null;
}
