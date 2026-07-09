const BUCKET_DAYS = [7, 30, 180, 365];

const AGE_COLORS = [
  'hsl(45, 90%, 55%)',
  'hsl(45, 60%, 50%)',
  'hsl(45, 35%, 47%)',
  'hsl(0, 0%, 55%)',
  'hsl(0, 0%, 42%)',
];

/** Bucket a commit date by age: 0 = freshest, last = oldest or unparsable. */
export function ageBucket(dateIso: string, now = new Date()): number {
  const then = new Date(dateIso).getTime();
  if (Number.isNaN(then)) return BUCKET_DAYS.length;
  const days = (now.getTime() - then) / 86_400_000;
  for (let i = 0; i < BUCKET_DAYS.length; i++) {
    if (days < BUCKET_DAYS[i]) return i;
  }
  return BUCKET_DAYS.length;
}

/** JetBrains-style "colors by age" for blame annotations. */
export function ageColor(dateIso: string, now = new Date()): string {
  return AGE_COLORS[ageBucket(dateIso, now)];
}
