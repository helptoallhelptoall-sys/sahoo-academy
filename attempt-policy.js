// Reviewed whole subject-name aliases; never classify by question text or IDs.
// Keep the SQL academy_seconds_per_question alias list in sync (tested).
export const extendedTimerSubjects = Object.freeze([
  'math', 'maths', 'mathematics', 'arithmetic', 'quantitative aptitude',
  'reasoning', 'general reasoning', 'logical reasoning', 'mental ability'
]);
export function secondsPerQuestion(subjectName) {
  const normalized = String(subjectName ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return extendedTimerSubjects.includes(normalized) ? 30 : 20;
}
export function automaticDurationSeconds(count, subjectName) {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid question count');
  return count * secondsPerQuestion(subjectName);
}
export function formatDuration(seconds) {
  if (!seconds) return 'Pending questions';
  const minutes = Math.floor(seconds / 60), remainder = seconds % 60;
  return [minutes ? `${minutes} min` : '', remainder ? `${remainder} sec` : ''].filter(Boolean).join(' ');
}
export function formatScore(score, scoringVersion = 1) {
  return scoringVersion >= 2 ? Number(score).toFixed(2) : String(score);
}
