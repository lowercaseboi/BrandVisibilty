/** API calls for one analysis: every question × samples × AIs (a simulated run counts as one source). */
export function runCalls(questions: number, samples: number, ais: number): number {
  return questions * samples * Math.max(1, ais);
}
