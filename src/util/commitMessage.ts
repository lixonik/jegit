import { notEmpty } from './guards';

const SUBJECT_LIMIT = 72;

/** JetBrains-style commit message inspections; returns human-readable issues. */
export function lintCommitMessage(message: string): string[] {
  const issues: string[] = [];
  const lines = message.split('\n');
  const subject = lines[0].trim();
  if (subject.length > SUBJECT_LIMIT) {
    issues.push(`Subject is ${subject.length} characters long; keep it under ${SUBJECT_LIMIT}.`);
  }
  if (lines.length > 1 && notEmpty(lines[1].trim())) {
    issues.push('Separate the subject from the body with a blank line.');
  }
  return issues;
}
