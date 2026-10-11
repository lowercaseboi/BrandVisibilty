import { describe, expect, it } from "vitest";
import type { Mention, Observation } from "../../api/types";
import { cutPoint, MAX_CHARS, pickSample, sampleReason } from "./answerHighlight";

const mention = (kind: Mention["entity_kind"], rank: number, start = 0, end = 4): Mention => ({
  entity_id: `${kind}-${rank}`,
  entity_kind: kind,
  rank,
  char_start: start,
  char_end: end,
  is_passing_mention: false,
});
const obs = (mentions: Mention[], text = "an answer", scored = true) => ({ response_text: text, mentions, scored }) as unknown as Observation;

describe("cutPoint", () => {
  it("keeps text that is only slightly over the limit whole", () => {
    expect(cutPoint("x".repeat(MAX_CHARS + 80), [])).toBe(MAX_CHARS + 80);
  });

  it("cuts long text at the last space before the limit", () => {
    const text = `${"word ".repeat(200)}`;
    const cut = cutPoint(text, []);
    expect(cut).toBeLessThanOrEqual(MAX_CHARS);
    expect(text[cut]).toBe(" ");
  });

  it("falls back to the limit when the only space is too early", () => {
    const text = `ab ${"x".repeat(MAX_CHARS + 200)}`;
    expect(cutPoint(text, [])).toBe(MAX_CHARS);
  });

  it("never cuts inside a highlighted mention", () => {
    const text = `${"word ".repeat(200)}`;
    const start = MAX_CHARS - 10;
    const end = MAX_CHARS + 25;
    expect(cutPoint(text, [mention("self", 1, start, end)])).toBe(end);
  });
});

describe("pickSample / sampleReason", () => {
  it("prefers an answer where a competitor comes before you", () => {
    const named = obs([mention("self", 1)]);
    const outranked = obs([mention("competitor", 1), mention("self", 2)]);
    expect(pickSample([named, outranked])).toBe(outranked);
    expect(sampleReason(outranked)).toBe("outranked");
  });

  it("falls back to the first answer that names you", () => {
    const none = obs([]);
    const named = obs([mention("self", 1)]);
    expect(pickSample([none, named])).toBe(named);
    expect(sampleReason(named)).toBe("named");
  });

  it("ignores unscored and empty answers", () => {
    expect(pickSample([obs([mention("competitor", 1)], "text", false), obs([mention("self", 1)], "  ")])).toBeNull();
  });
});
