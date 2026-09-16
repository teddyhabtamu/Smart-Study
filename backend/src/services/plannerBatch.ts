import { CONTENT_SUBJECTS } from '../constants';

// Subject normalization map - maps common variations to allowed subjects
export const normalizeSubject = (subject: string): string | null => {
  if (!subject) return null;

  const normalized = subject.trim();
  const subjectMap: Record<string, string> = {
    'mathematics': 'Mathematics',
    'math': 'Mathematics',
    'maths': 'Mathematics',
    'english': 'English',
    'history': 'History',
    'chemistry': 'Chemistry',
    'physics': 'Physics',
    'biology': 'Biology',
    'civics': 'Civics',
    'geography': 'Geography',
    'economics': 'Economics',
    'business': 'Business',
    'ict': 'ICT',
    'information technology': 'ICT',
    'amharic': 'Amharic',
    'afaan oromoo': 'Afaan Oromoo',
    'oromoo': 'Afaan Oromoo',
    'tigrigna': 'Tigrigna',
    'tigrinya': 'Tigrigna',
    'aptitude': 'Aptitude',
    'sat': 'SAT',
    'act': 'ACT',
    'gmat': 'GMAT',
    'gre': 'GRE',
    'toefl': 'TOEFL',
    'ielts': 'IELTS',
    'general': 'Mathematics', // Default to Mathematics for "General"
    'other': 'Mathematics'
  };

  const lowerSubject = normalized.toLowerCase();
  return subjectMap[lowerSubject] || (CONTENT_SUBJECTS.includes(normalized) || ['SAT', 'ACT', 'GMAT', 'GRE', 'TOEFL', 'IELTS'].includes(normalized) ? normalized : null);
};

// --- Batch payload validation (pure, unit-tested) ---------------------------
// Batch-create used to validate inline in the route: untestable without HTTP
// and every branch edit risked the contract. These helpers own all of it;
// routes only wire HTTP ↔ DB.

export interface BatchEventInput {
  title: unknown;
  subject: unknown;
  event_date: unknown;
  event_type: unknown;
  notes?: unknown;
}

// One validated row, column-ordered for the multi-row INSERT:
// [user_id, title, subject, event_date, event_type, notes]
export type BatchEventRow = [string, string, string, string, string, string];

const BATCH_EVENT_TYPES: readonly string[] = ['Exam', 'Revision', 'Assignment'];

export const validateBatchEvent = (
  event: BatchEventInput | null | undefined,
  index: number,
  userId: string
): { ok: true; row: BatchEventRow } | { ok: false; message: string } => {
  if (!event || typeof event.title !== 'string' || !event.title.trim() || event.title.trim().length > 200) {
    return { ok: false, message: `events[${index}].title is required (1-200 chars)` };
  }
  const normalizedSubject = normalizeSubject(event.subject as string);
  if (!normalizedSubject) {
    return { ok: false, message: `events[${index}].subject "${(event as BatchEventInput)?.subject}" is invalid` };
  }
  if (
    typeof event.event_date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(event.event_date.trim()) ||
    isNaN(new Date(event.event_date).getTime())
  ) {
    return { ok: false, message: `events[${index}].event_date must be YYYY-MM-DD` };
  }
  if (!BATCH_EVENT_TYPES.includes(event.event_type as string)) {
    return { ok: false, message: `events[${index}].event_type must be Exam/Revision/Assignment` };
  }
  return {
    ok: true,
    row: [
      userId,
      (event.title as string).trim(),
      normalizedSubject,
      (event.event_date as string).trim(),
      event.event_type as string,
      String((event as BatchEventInput).notes ?? '').trim(),
    ],
  };
};

// Every item validated before anything touches the DB (all-or-nothing: the
// first failure rejects the whole batch, so a half-written schedule is
// impossible).
export const validateBatchEvents = (
  events: Array<BatchEventInput | null | undefined>,
  userId: string
): { ok: true; rows: BatchEventRow[] } | { ok: false; message: string } => {
  const rows: BatchEventRow[] = [];
  for (const [i, e] of events.entries()) {
    const verdict = validateBatchEvent(e, i, userId);
    if (!verdict.ok) return verdict;
    rows.push(verdict.row);
  }
  return { ok: true, rows };
};

// Parameterized multi-row INSERT for validated rows (single round trip).
export const buildBatchInsert = (rows: BatchEventRow[]): { text: string; values: any[] } => {
  const values: any[] = [];
  const valueGroups = rows.map((r) => {
    const start = values.length + 1;
    values.push(r[0], r[1], r[2], r[3], r[4], false, r[5]);
    return `($${start}, $${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6})`;
  });
  return {
    text: `INSERT INTO study_events (user_id, title, subject, event_date, event_type, is_completed, notes) VALUES ${valueGroups.join(', ')} RETURNING *`,
    values,
  };
};
