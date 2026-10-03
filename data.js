// Public, original demonstration content only. Never put paid questions or private records here.
export const exams = [
  { id: 'police-si', name: 'Odisha Police SI', group: 'Odisha Police', label: 'Sub-Inspector', icon: 'shield', color: 'sage', desc: 'Build a strong foundation for your journey into public service.' },
  { id: 'osssc-peo', name: 'OSSSC PEO', group: 'OSSSC', label: 'Panchayat Executive Officer', icon: 'building', color: 'sand', desc: 'Prepare step by step for a career serving your community.' },
  { id: 'opsc', name: 'OPSC OCS', group: 'OPSC', label: 'Odisha Civil Services', icon: 'landmark', color: 'lilac', desc: 'Connect concepts, strengthen fundamentals and practise with purpose.' },
  { id: 'police-constable', name: 'Odisha Police Constable', group: 'Odisha Police', label: 'Constable', icon: 'shield', color: 'blue', desc: 'Make everyday practice part of your preparation routine.' },
  { id: 'ossc-cgl', name: 'OSSC CGL', group: 'OSSC', label: 'Combined Graduate Level', icon: 'book', color: 'pink', desc: 'Develop confidence across quantitative and general subjects.' },
  { id: 'osssc-ri', name: 'OSSSC RI / AMIN', group: 'OSSSC', label: 'Revenue recruitment', icon: 'map', color: 'sage', desc: 'Build a balanced study plan across core preparation subjects.' }
];
export const subjects = [
  { id: 'geography', name: 'Geography', icon: 'globe', color: 'sage', topics: ['Solar System', 'Atmosphere', 'Rivers', 'Earth', 'Climate'] },
  { id: 'quant', name: 'Quantitative Aptitude', icon: 'calculator', color: 'sage', topics: ['Percentages', 'Ratio & proportion', 'Profit & loss', 'Time & work'] },
  { id: 'reasoning', name: 'Logical Reasoning', icon: 'spark', color: 'lilac', topics: ['Number series', 'Analogies', 'Coding & decoding', 'Directions'] },
  { id: 'gk', name: 'General Knowledge', icon: 'globe', color: 'sand', topics: ['Odisha geography', 'Indian history', 'Indian polity', 'General science'] },
  { id: 'english', name: 'English Language', icon: 'book', color: 'blue', topics: ['Grammar', 'Vocabulary', 'Reading comprehension', 'Sentence correction'] },
  { id: 'odia', name: 'Odia Language', icon: 'pen', color: 'pink', topics: ['ବ୍ୟାକରଣ / Grammar', 'ଶବ୍ଦଭଣ୍ଡାର / Vocabulary', 'Reading comprehension', 'Literature basics'] },
  { id: 'computer', name: 'Computer Awareness', icon: 'monitor', color: 'sage', topics: ['Computer fundamentals', 'Internet basics', 'Office applications', 'Digital safety'] }
];
export const questions = [
  { id: 'q1', subject: 'Quantitative Aptitude', topic: 'Percentages', text: 'What is 20% of 250?', options: ['25', '40', '50', '75'], answer: 2, explanation: '20% of 250 = (20 ÷ 100) × 250 = 50.' },
  { id: 'q2', subject: 'Logical Reasoning', topic: 'Number series', text: 'Which number comes next: 3, 6, 12, 24, …?', options: ['30', '36', '42', '48'], answer: 3, explanation: 'Each number is twice the previous number. 24 × 2 = 48.' },
  { id: 'q3', subject: 'General Knowledge', topic: 'Odisha geography', text: 'Which city is the capital of Odisha?', options: ['Cuttack', 'Bhubaneswar', 'Sambalpur', 'Puri'], answer: 1, explanation: 'Bhubaneswar is the capital of Odisha.' },
  { id: 'q4', subject: 'English Language', topic: 'Grammar', text: 'Choose the correct sentence.', options: ['She go to school.', 'She going to school.', 'She goes to school.', 'She gone to school.'], answer: 2, explanation: 'The singular subject “she” takes “goes” in the simple present tense.' },
  { id: 'q5', subject: 'Quantitative Aptitude', topic: 'Percentages', text: 'A book costs ₹200. After a 10% discount, what is its price?', options: ['₹190', '₹180', '₹170', '₹160'], answer: 1, explanation: 'The discount is 10% of ₹200 = ₹20. The price is ₹200 − ₹20 = ₹180.' },
  { id: 'q6', subject: 'Computer Awareness', topic: 'Computer fundamentals', text: 'Which component is primarily responsible for executing instructions?', options: ['Monitor', 'Keyboard', 'CPU', 'Printer'], answer: 2, explanation: 'The central processing unit (CPU) executes program instructions.' }
];
for (const question of questions) question.tags = ['Original Sahoo ExamNexa sample · not a PYP'];
export const tests = [
  { id: 'mixed', access: 'free', pricePaise: 0, title: 'Odisha essentials', type: 'Mixed', subject: 'All subjects', desc: 'A little of everything. Find your starting point.', ids: ['q1','q2','q3','q4','q5','q6'], minutes: 6, timerOverrideMinutes: 6, color: 'sage' },
  { id: 'percentages', access: 'free', pricePaise: 0, title: 'Percentages made simple', type: 'Topic-wise', subject: 'Quantitative Aptitude', desc: 'Small steps towards stronger number skills.', ids: ['q1','q5'], minutes: 3, timerOverrideMinutes: 3, color: 'sand' },
  { id: 'full', access: 'free', pricePaise: 0, title: 'Full-test format preview', type: 'Full mock', subject: 'All subjects', desc: 'Try the test experience with a short sample set.', ids: ['q1','q2','q3','q4','q5','q6'], minutes: 6, timerOverrideMinutes: 6, color: 'lilac' }
];
export function gradeTest(items, answers) {
  const correct = items.filter(q => answers[q.id] === q.answer).length;
  const attempted = items.filter(q => Number.isInteger(answers[q.id])).length;
  return { correct, attempted, incorrect: attempted - correct, skipped: items.length - attempted, total: items.length, accuracy: attempted ? Math.round(correct / attempted * 100) : 0, percentage: Math.round(correct / items.length * 100) };
}
