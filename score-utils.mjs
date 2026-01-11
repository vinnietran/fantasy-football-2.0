export function normalizeScore(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toScoreCents(value) {
  return Math.round(normalizeScore(value) * 100);
}

export function fromScoreCents(cents) {
  return Number.isFinite(cents) ? cents / 100 : 0;
}

export function formatScore(value) {
  return formatScoreFromCents(toScoreCents(value));
}

export function formatScoreFromCents(cents) {
  return fromScoreCents(cents).toFixed(2);
}
