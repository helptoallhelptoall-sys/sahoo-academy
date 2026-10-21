// Brand metadata only. Never derive crawlable content from private catalog/session data.
export const homeTitle = 'Sahoo ExamNexa – Odisha Competitive Exam Mock Tests & PYQs';
export const homeDescription = 'Prepare for Odisha competitive exams including Odisha Police SI, PEO and Civil Constable with topic-wise mock tests and clearly labelled previous-year questions (PYQs).';

// Hash routes are application views, not separate sitemap documents. Only the
// static homepage is indexable; authorization remains entirely server-enforced.
export function indexableHome(location, base) {
  const root = new URL(base);
  return [root.pathname, root.pathname + 'index.html'].includes(location.pathname)
    && !location.search && ['', '#/home'].includes(location.hash);
}
