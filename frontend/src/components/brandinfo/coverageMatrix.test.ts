import { describe, expect, it } from "vitest";
import type { Question } from "../../api/types";
import { GENERAL_COLUMN, buildCoverageMatrix } from "./coverageMatrix";

let nextId = 1;

function q(partial: Partial<Question> & Pick<Question, "text" | "intent_type">): Question {
  return {
    id: nextId++,
    source: "template",
    enabled: true,
    names_brand: false,
    scored: true,
    ...partial,
  };
}

describe("buildCoverageMatrix", () => {
  it("is empty when there are no enabled questions", () => {
    const m = buildCoverageMatrix([], ["Mumbai"]);
    expect(m.intents).toEqual([]);
    expect(m.cells).toEqual([]);
    expect(m.cities).toEqual(["Mumbai", GENERAL_COLUMN]);
  });

  it("buckets a question under the tracked city it mentions", () => {
    const questions = [
      q({ text: "vada pav outlet in Mumbai", intent_type: "local_contextual" }),
      q({ text: "vada pav outlet in Pune", intent_type: "local_contextual" }),
    ];
    const m = buildCoverageMatrix(questions, ["Mumbai", "Pune"]);
    expect(m.intents).toEqual(["local_contextual"]);
    expect(m.cities).toEqual(["Mumbai", "Pune", GENERAL_COLUMN]);
    expect(m.cells).toEqual([
      [
        { count: 1, blind: false },
        { count: 1, blind: false },
        { count: 0, blind: true },
      ],
    ]);
  });

  it("falls back to the general column when no tracked city is mentioned", () => {
    const questions = [q({ text: "best vada pav for office-goers", intent_type: "category_discovery" })];
    const m = buildCoverageMatrix(questions, ["Mumbai"]);
    expect(m.cells).toEqual([[{ count: 0, blind: true }, { count: 1, blind: false }]]);
  });

  it("matches city names case- and diacritic-insensitively", () => {
    const questions = [q({ text: "cafés in PUNE for students", intent_type: "local_contextual" })];
    const m = buildCoverageMatrix(questions, ["pune"]);
    expect(m.cells[0][0]).toEqual({ count: 1, blind: false });
  });

  it("excludes disabled questions", () => {
    const questions = [
      q({ text: "vada pav outlet in Mumbai", intent_type: "local_contextual", enabled: false }),
      q({ text: "alternatives to Jumbo King", intent_type: "alternative_seeking" }),
    ];
    const m = buildCoverageMatrix(questions, ["Mumbai"]);
    expect(m.intents).toEqual(["alternative_seeking"]);
  });

  it("keeps intents in first-seen order and dedupes repeated cities", () => {
    const questions = [
      q({ text: "how do I find a quick snack", intent_type: "problem_first" }),
      q({ text: "vada pav outlet in Mumbai", intent_type: "local_contextual" }),
      q({ text: "another problem question", intent_type: "problem_first" }),
    ];
    const m = buildCoverageMatrix(questions, ["Mumbai", "mumbai ", "Mumbai"]);
    expect(m.intents).toEqual(["problem_first", "local_contextual"]);
    expect(m.cities).toEqual(["Mumbai", GENERAL_COLUMN]);
  });

  it("aggregates multiple questions into the same cell", () => {
    const questions = [
      q({ text: "vada pav outlet in Mumbai", intent_type: "local_contextual" }),
      q({ text: "cheapest vada pav in Mumbai", intent_type: "local_contextual" }),
    ];
    const m = buildCoverageMatrix(questions, ["Mumbai"]);
    expect(m.cells).toEqual([[{ count: 2, blind: false }, { count: 0, blind: true }]]);
  });

  it("is pure: same inputs produce an equal (deep) result", () => {
    const questions = [q({ text: "vada pav outlet in Mumbai", intent_type: "local_contextual" })];
    const cities = ["Mumbai"];
    expect(buildCoverageMatrix(questions, cities)).toEqual(buildCoverageMatrix(questions, cities));
  });
});
