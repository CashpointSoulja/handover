import type { ReactNode } from 'react';
import type { Decision, Mode } from '../engine/types';

export function DecisionBadge({ decision, size = 'sm' }: { decision: Decision | null; size?: 'sm' | 'lg' }) {
  const d = decision ?? 'PENDING';
  return <span className={`badge badge-${d.toLowerCase()} badge-${size}`}>{decision ?? 'Pending'}</span>;
}

export function ModeBadge({ mode }: { mode: Mode }) {
  return <span className={`mode mode-${mode}`}>{mode === 'auto' ? 'Auto' : 'Manual'}</span>;
}

export function Mono({ children }: { children: ReactNode }) {
  return <code className="mono">{children}</code>;
}

export const DECISIONS: Decision[] = ['CANCEL', 'FLAG', 'ASK', 'HUMAN', 'LEAVE'];

export const ATTACHMENT_LABELS: Record<string, string> = {
  refund_request: 'refund_request',
  priority_urgent: 'priority: urgent',
  route: 'route',
  cancel_via: 'cancel_via',
  cancel_method: 'cancel_method',
  duplicate_of: 'duplicate_of',
  deadline: 'deadline',
  price_rise: 'price_rise',
};
