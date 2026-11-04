// Shared types for the Handover engine. The engine is pure: no IO, no clock, no randomness.

export type Mode = 'auto' | 'manual';
export type Decision = 'CANCEL' | 'FLAG' | 'ASK' | 'HUMAN' | 'LEAVE';
export type CapLevel = 'CANCEL' | 'FLAG' | 'ASK' | 'HUMAN';
export type Cadence = 'weekly' | 'monthly' | 'annual';
export type PaymentType = 'card' | 'direct_debit' | 'standing_order' | 'faster_payment' | 'credit';
export type RuleId = `R${string}`;

/** Open Banking-shaped transaction. Debits are negative. */
export interface Transaction {
  id: string;
  bookingDate: string; // YYYY-MM-DD
  amount: number; // GBP
  currency: 'GBP';
  descriptor: string;
  counterparty: string;
  paymentType: PaymentType;
  accountId: string;
}

export interface Cancellation {
  payment: string;
  service: string;
  cancelledOn: string;
  source: string | null; // chat message id
  finalBill?: { maxAmount: number; by: string };
}

export interface Trial {
  service: string;
  descriptor: string;
  account: string;
  startedOn: string;
  convertsOn: string;
  trialPrice: number;
  fullPrice: number;
  cadence: Cadence;
}

export interface Bundle {
  parent: string;
  includes: string[];
  source: string | null;
}

export interface Household {
  id: string;
  surname: string;
  member: string;
  mode: Mode;
  asOf: string;
  accounts: { id: string; label: string }[];
  story: string;
  cancellations: Cancellation[];
  trials: Trial[];
  bundles: Bundle[];
}

export type SignalKind = 'keep' | 'identified' | 'shared' | 'not_shared' | 'unused' | 'unsure';

export interface Signal {
  payment: string;
  kind: SignalKind;
  service?: string;
}

export interface ChatMessage {
  id: string;
  at: string; // ISO local date-time
  from: 'member' | 'nous';
  author?: string;
  text: string;
  signals?: Signal[];
  buttons?: string[];
}

export interface HouseholdData {
  household: Household;
  transactions: Transaction[];
  chat: ChatMessage[];
}

// ---------- config ----------

export type MerchantKind = 'subscription' | 'instalment' | 'essential_bill' | 'retail' | 'income';

export interface Merchant {
  key: string;
  name: string;
  category: string;
  kind: MerchantKind;
  patterns: string[];
  route?: string;
  id?: 'from_descriptor';
  contract?: { minimum_term_months: number; notice_days: number };
}

export interface Aggregator {
  key: string;
  name: string;
  patterns: string[];
  id: string; // fixed id, or 'from_descriptor'
}

export interface PriceEntry {
  name?: string;
  billed_via?: string[];
  tiers: Record<string, number>;
}

export interface Policy {
  provider: string;
  refund_window_days: number;
  source_url: string | null;
  verified_on: string | null;
  status: 'verified' | 'assumed';
}

export interface RuleConfig {
  id: RuleId;
  name: string;
  type: 'terminal' | 'cap' | 'attach';
  effect?: string;
  attach?: string[];
  threshold?: Record<string, number>;
  enabled: boolean;
  locked?: boolean;
  protects: string;
}

export interface MessageButton {
  label: string;
  signal?: { kind: SignalKind; service?: string };
}

export interface MessageTemplate {
  text: string;
  buttons?: MessageButton[];
}

export interface Config {
  merchants: Merchant[];
  aggregators: Aggregator[];
  prices: Record<string, PriceEntry>;
  policies: Policy[];
  rules: RuleConfig[];
  rulesVersion: string;
  messages: Record<string, MessageTemplate>;
}

// ---------- pipeline outputs ----------

export interface Normalised {
  serviceKey: string; // merchant key, or aggregator key
  serviceName: string;
  isAggregator: boolean;
  idBase: string;
  kind: MerchantKind | 'aggregator' | 'unmatched';
  category: string;
  merchant?: Merchant;
}

export interface RecurringPayment {
  id: string;
  householdId: string;
  serviceKey: string;
  serviceName: string;
  identity: string; // used to spot the same service on two streams
  isAggregator: boolean;
  identifiedAs: string | null; // service the member said an aggregator charge is
  rawDescriptor: string;
  kind: Normalised['kind'];
  category: string;
  accountId: string;
  paymentType: PaymentType;
  cadence: Cadence;
  charges: Transaction[];
  amount: number; // latest charge, positive
  lastCharge: string | null;
  nextExpected: string;
  annualisedCost: number;
  trial: Trial | null;
  merchant?: Merchant;
}

export interface Proposal {
  service: string;
  category: string;
  isSubscription: boolean;
  proposedAction: Decision;
  confidence: number;
  rationale: string;
}

export interface RecordedProposal {
  meta: {
    model: string;
    run_at: string;
    prompt_version: string;
    input_hash: string;
    household: string;
    payment: string;
    branch: string | null;
  };
  proposal: Proposal;
}

export type AttachmentKind =
  | 'refund_request'
  | 'priority_urgent'
  | 'route'
  | 'cancel_via'
  | 'cancel_method'
  | 'duplicate_of'
  | 'deadline'
  | 'price_rise';

export interface Attachment {
  kind: AttachmentKind;
  value?: string;
  rule: RuleId;
}

export interface Evidence {
  transactions: string[];
  messages: string[];
}

export interface FiredRule {
  id: RuleId;
  type: RuleConfig['type'];
  effect: Decision | null; // terminal decision or cap level; null for pure attach
  attachments: Attachment[];
  detail: string;
  evidence: Evidence;
  policyStatus?: Policy['status'];
}

export interface MemberMessage {
  templateKey: string;
  text: string;
  buttons: (MessageButton & { branch: string | null })[];
}

export interface DecisionResult {
  householdId: string;
  payment: RecurringPayment;
  mode: Mode;
  branch: string | null;
  proposal: RecordedProposal | null;
  proposalStatus: 'recorded' | 'missing' | 'stale';
  proposalInputHash: string;
  fired: FiredRule[];
  notFired: RuleId[];
  notReached: RuleId[];
  waiting: RuleId[]; // rules that need a proposal to evaluate
  disabled: RuleId[];
  ceiling: CapLevel | null;
  decision: Decision | null; // null: pending a recorded proposal
  decidedBy: 'llm' | RuleId | null;
  attachments: Attachment[];
  message: MemberMessage | null;
}
