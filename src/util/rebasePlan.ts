import { isEmpty } from './guards';

export interface RebaseStep {
  hash: string;
  action: string;
}

/** Validate an interactive-rebase plan; returns a problem description or undefined. */
export function validateRebasePlan(plan: RebaseStep[]): string | undefined {
  const kept = plan.filter((p) => p.action !== 'drop');
  if (isEmpty(kept)) return 'keep at least one commit';
  if (kept[0].action !== 'pick') return 'the first kept commit must be "pick"';
  return undefined;
}

/** Render the plan as a git rebase todo file. */
export function renderRebaseTodo(plan: RebaseStep[]): string {
  return plan.map((p) => `${p.action} ${p.hash}`).join('\n') + '\n';
}
