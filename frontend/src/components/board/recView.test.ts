import { describe, expect, it } from "vitest";
import type { Gap, Mention, Observation } from "../../api/types";
import { getT } from "../../i18n";
import type { Formatter } from "../../i18n";
import {
  capLine,
  effortWordKey,
  evidenceCount,
  impactOf,
  isExportOnly,
  localizeReasoningParams,
  plainWhy,
  reasoningMessages,
} from "./recView";

const en = getT("en");
const hi = getT("hi");
const fmt: Pick<Formatter, "number"> = { number: (n) => String(n) };
const labelOf = (id: string) => (id === "gemini" ? "Google Gemini" : id);

describe("effortWordKey", () => {
  it("maps the engine's 1 / 3 / 5 / 8 scale to time words", () => {
    expect(effortWordKey(1)).toBe("board.effort.hour");
    expect(effortWordKey(3)).toBe("board.effort.halfDay");
    expect(effortWordKey(5)).toBe("board.effort.days");
    expect(effortWordKey(8)).toBe("board.effort.week");
    expect(en(effortWordKey(1))).toBe("About an hour");
    expect(en(effortWordKey(8))).toBe("A week or more");
  });

  it("buckets in-between and missing values", () => {
    expect(effortWordKey(2)).toBe("board.effort.halfDay");
    expect(effortWordKey(4)).toBe("board.effort.days");
    expect(effortWordKey(13)).toBe("board.effort.week");
    expect(effortWordKey(undefined)).toBe("board.effort.hour");
    expect(effortWordKey(Number.NaN)).toBe("board.effort.hour");
  });
});

describe("evidenceCount", () => {
  it("uses evidence_count when present, even above 10", () => {
    expect(evidenceCount({ evidence_count: 4, confidence: 0.9 })).toBe(4);
    expect(evidenceCount({ evidence_count: 27, confidence: 1 })).toBe(27);
    expect(evidenceCount({ evidence_count: 0, confidence: 0.2 })).toBe(0);
  });

  it("falls back to round(confidence × 10) for older snapshots", () => {
    expect(evidenceCount({ confidence: 0.4 })).toBe(4);
    expect(evidenceCount({ confidence: 0.35 })).toBe(4);
    expect(evidenceCount({ confidence: 1 })).toBe(10);
    expect(evidenceCount({ confidence: 1.7 })).toBe(10);
  });

  it("ignores a malformed evidence_count", () => {
    expect(evidenceCount({ evidence_count: -1, confidence: 0.3 })).toBe(3);
    expect(evidenceCount({ evidence_count: Number.NaN, confidence: 0.3 })).toBe(3);
    expect(evidenceCount({ confidence: Number.NaN })).toBe(0);
  });
});

describe("capLine", () => {
  it("shows only when more were found than kept", () => {
    expect(capLine(14, 10)).toEqual({ n: 10, total: 14 });
    expect(capLine(10, 10)).toBeNull();
    expect(capLine(3, 3)).toBeNull();
  });

  it("is off for old snapshots and empty lists", () => {
    expect(capLine(undefined, 10)).toBeNull();
    expect(capLine(null, 10)).toBeNull();
    expect(capLine(5, 0)).toBeNull();
    expect(capLine(Number.NaN, 4)).toBeNull();
  });
});

describe("impactOf", () => {
  it("rounds a positive gain to points, with a 'less than a point' case", () => {
    expect(impactOf(4.4, "presence")).toEqual({ kind: "points", n: 4 });
    expect(impactOf(0.6, "presence")).toEqual({ kind: "points", n: 1 });
    expect(impactOf(0.3, "competitive")).toEqual({ kind: "small" });
  });

  it("says 'not scored' for gap types outside the score model", () => {
    expect(impactOf(0, "representation")).toEqual({ kind: "notScored", reason: "representation" });
    expect(impactOf(0, "source")).toEqual({ kind: "notScored", reason: "source" });
    expect(impactOf(0, undefined, "assumption.unscored")).toEqual({ kind: "notScored", reason: "representation" });
  });

  it("says 'little change' for a scored gap whose simulation moved nothing", () => {
    expect(impactOf(0, "presence")).toEqual({ kind: "flat" });
    expect(impactOf(0, undefined, "assumption.presence")).toEqual({ kind: "flat" });
  });
});

describe("isExportOnly", () => {
  it("covers listings, pitches and forum answers", () => {
    expect(isExportOnly("submit_to_directory")).toBe(true);
    expect(isExportOnly("pitch_listicle")).toBe(true);
    expect(isExportOnly("community_answer")).toBe(true);
    expect(isExportOnly("faq_page")).toBe(false);
  });
});

// ------------------------------------------------------------------------ reasoning

const competitiveRec = {
  reasoning_key: "finding.competitive",
  reasoning_params: {
    brand: "Gajanan Vada Pav",
    competitor: "Ashok Vada Pav",
    competitor_id: "ashok",
    co_occurrence_pct: 40,
    beat_pct: 75,
    evidence_count: 8,
    action: "comparison_page",
    action_key: "action.comparison_page_vs",
    assumption_key: "assumption.competitive",
    changed_count: 6,
    delta: "2.4",
    gap_type: "competitive",
  },
};

const render = (t: typeof en, msgs: { key: Parameters<typeof en>[0]; vars?: Record<string, string | number> }[]) =>
  msgs.map((m) => t(m.key, m.vars)).join(" ");

describe("reasoningMessages", () => {
  it("renders the finding, action and impact sentences from the keys", () => {
    const msgs = reasoningMessages(competitiveRec, (p) => localizeReasoningParams(p, en, fmt, labelOf));
    expect(msgs).not.toBeNull();
    expect(msgs!.map((m) => m.key)).toEqual([
      "dashboard.recs.why.finding.competitive",
      "dashboard.recs.why.action.comparison_page_vs",
      "dashboard.recs.why.assumption.competitive",
    ]);
    expect(render(en, msgs!)).toBe(
      "Ashok Vada Pav shows up alongside Gajanan Vada Pav in 40% of answers and is ranked ahead of it in 75% of those (8 responses). " +
        "Recommended: publish a “Gajanan Vada Pav vs Ashok Vada Pav” comparison page that states where Gajanan Vada Pav wins. " +
        "If it ranked ahead of Ashok Vada Pav in the 6 answers where it currently trails, the visibility score would rise by about 2.4 points (simulated).",
    );
  });

  it("renders in Hindi with the brand names kept as they are", () => {
    const msgs = reasoningMessages(competitiveRec, (p) => localizeReasoningParams(p, hi, fmt, labelOf))!;
    const text = render(hi, msgs);
    expect(text).toContain("Ashok Vada Pav");
    expect(text).toContain("Gajanan Vada Pav");
    expect(text).not.toMatch(/\{\w+\}/);
    expect(text).toContain("सुझाव:");
    expect(text).not.toBe(render(en, msgs));
  });

  it("falls back (null) for old snapshots and unknown keys", () => {
    expect(reasoningMessages({})).toBeNull();
    expect(reasoningMessages({ reasoning_key: "" })).toBeNull();
    expect(reasoningMessages({ reasoning_key: "finding.not_a_real_key", reasoning_params: competitiveRec.reasoning_params })).toBeNull();
    expect(
      reasoningMessages({ ...competitiveRec, reasoning_params: { ...competitiveRec.reasoning_params, action_key: "action.teleport" } }),
    ).toBeNull();
  });

  it("falls back when a placeholder has no value", () => {
    const { competitor: _drop, ...rest } = competitiveRec.reasoning_params;
    expect(reasoningMessages({ reasoning_key: "finding.competitive", reasoning_params: rest })).toBeNull();
  });

  it("shows AI product names, translated intent examples and gap type names", () => {
    const vars = localizeReasoningParams(
      { provider: "gemini", intent: "problem_first", intent_example: "'how do I ...'", gap_type: "presence", coverage_pct: 12 },
      en,
      fmt,
      labelOf,
    );
    expect(vars.provider).toBe("Google Gemini");
    expect(vars.intent_example).toBe(en("dashboard.intent.problem_first"));
    expect(vars.gap_type).toBe("Low presence");
    expect(vars.coverage_pct).toBe("12");
    // An intent with no example (e.g. custom questions) quotes its label instead.
    expect(localizeReasoningParams({ intent: "custom", intent_label: "custom" }, en, fmt, labelOf).intent_example).toBe("“custom”");
  });
});

// ------------------------------------------------------------------------ plain "Why"

const m = (entity_id: string, rank: number): Mention => ({
  entity_id,
  entity_kind: entity_id === "self" ? "self" : "competitor",
  rank,
  char_start: 0,
  char_end: 1,
  is_passing_mention: false,
});

const obs = (id: string, query: string, mentions: Mention[], provider = "gemini"): Observation => ({
  observation_id: id,
  query_id: "q0",
  query_text: query,
  intent_type: "category_discovery",
  provider_id: provider,
  model_version: "x",
  response_text: "",
  mentions,
});

const gap = (type: string, refs: string[], detail: Record<string, unknown> = {}): Gap => ({
  gap_id: `g-${type}`,
  gap_type: type,
  evidence_refs: refs,
  detail,
  is_inferred: false,
});

const entities = { self: "Gajanan", ashok: "Ashok Vada Pav", kirti: "Kirti" };
const byId = (list: Observation[]) => new Map(list.map((o) => [o.observation_id, o]));

describe("plainWhy", () => {
  const answers = byId([
    obs("a", "best vada pav in Dadar", [m("ashok", 1)]),
    obs("b", "best vada pav in Dadar", [m("ashok", 1), m("kirti", 2)]),
    obs("c", "cheap snacks near me", []),
    obs("d", "cheap snacks near me", []),
    obs("e", "cheap snacks near me", []),
    obs("f", "late night food", [m("self", 3), m("kirti", 1)]),
    obs("g", "late night food", [m("self", 2), m("ashok", 1)]),
    obs("h", "late night food", [m("self", 1), m("ashok", 2)]),
  ]);

  it("presence: quotes the question where a competitor is named instead", () => {
    const msg = plainWhy(gap("presence", ["a", "b", "c", "d", "e"], { scope: "overall" }), answers, entities, labelOf);
    expect(msg).toEqual({
      key: "dashboard.recs.plain.nameInstead",
      vars: { competitor: "Ashok Vada Pav", question: "best vada pav in Dadar" },
    });
    expect(en(msg!.key, msg!.vars)).toBe("AI assistants name Ashok Vada Pav instead of you when people ask “best vada pav in Dadar”.");
    expect(getT("mr")(msg!.key, msg!.vars)).toContain("“best vada pav in Dadar”");
  });

  it("presence: says 'don't mention you' when no competitor was named", () => {
    const msg = plainWhy(gap("presence", ["c", "d"], { scope: "overall" }), answers, entities, labelOf);
    expect(msg).toEqual({ key: "dashboard.recs.plain.missing", vars: { question: "cheap snacks near me" } });
  });

  it("presence on one AI names that AI", () => {
    const msg = plainWhy(gap("presence", ["a", "c"], { scope: "provider", provider_id: "gemini" }), answers, entities, labelOf);
    expect(msg?.key).toBe("dashboard.recs.plain.nameInsteadAi");
    expect(msg?.vars).toMatchObject({ ai: "Google Gemini", competitor: "Ashok Vada Pav" });
  });

  it("competitive: only responses where the competitor is ahead count", () => {
    const msg = plainWhy(gap("competitive", ["f", "g", "h"], { competitor_id: "ashok" }), answers, entities, labelOf);
    expect(msg).toEqual({ key: "dashboard.recs.plain.ahead", vars: { competitor: "Ashok Vada Pav", question: "late night food" } });
    expect(plainWhy(gap("competitive", ["h"], { competitor_id: "ashok" }), answers, entities, labelOf)).toBeNull();
  });

  it("prominence: names who comes first, or gives the position", () => {
    const withName = plainWhy(gap("prominence", ["f", "g", "h"]), answers, entities, labelOf);
    expect(withName?.key).toBe("dashboard.recs.plain.low");
    expect(withName?.vars?.question).toBe("late night food");
    const lonely = byId([obs("x", "vada pav", [m("self", 4)]), obs("y", "vada pav", [m("self", 3)])]);
    expect(plainWhy(gap("prominence", ["x", "y"]), lonely, entities, labelOf)).toEqual({
      key: "dashboard.recs.plain.lowGeneric",
      vars: { rank: 4, question: "vada pav" },
    });
  });

  it("clips very long questions", () => {
    const long = "which shop sells the best vada pav ".repeat(6);
    const msg = plainWhy(gap("presence", ["z"], { scope: "overall" }), byId([obs("z", long, [])]), entities, labelOf);
    const q = String(msg?.vars?.question);
    expect(q.length).toBeLessThanOrEqual(110);
    expect(q.endsWith("…")).toBe(true);
  });

  it("returns null (caller falls back to the gap finding) without usable responses", () => {
    const g = gap("presence", ["a"], { scope: "overall" });
    expect(plainWhy(g, null, entities, labelOf)).toBeNull();
    expect(plainWhy(g, new Map(), entities, labelOf)).toBeNull();
    expect(plainWhy(gap("presence", ["missing"]), answers, entities, labelOf)).toBeNull();
    expect(plainWhy(gap("representation", ["a"]), answers, entities, labelOf)).toBeNull();
    expect(plainWhy(gap("source", ["a"]), answers, entities, labelOf)).toBeNull();
  });
});
