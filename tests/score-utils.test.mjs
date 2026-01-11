import assert from "node:assert/strict";
import { formatScore } from "../score-utils.mjs";

const cases = [
  { input: 10, expected: "10.00" },
  { input: 10.5, expected: "10.50" },
  { input: 10.55, expected: "10.55" },
  { input: 0, expected: "0.00" },
  { input: ".75", expected: "0.75" },
  { input: null, expected: "0.00" },
  { input: undefined, expected: "0.00" },
  { input: -2.5, expected: "-2.50" }
];

cases.forEach(({ input, expected }) => {
  assert.equal(formatScore(input), expected);
});

console.log("score-utils tests passed");
