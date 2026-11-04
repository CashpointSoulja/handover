/**
 * Builds fixtures/households/<id>/{household,transactions,chat}.json from the
 * hand-written household stories below. Deterministic: same input, same files.
 *
 *   npx tsx scripts/build-fixtures.ts
 *
 * Every household covers 1 May to 31 October 2026. Annual plans also carry the
 * previous year's renewal so their cadence can be seen.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type PaymentType = 'card' | 'direct_debit' | 'standing_order';

interface Tx {
  bookingDate: string;
  amount: number;
  currency: 'GBP';
  descriptor: string;
  counterparty: string;
  paymentType: PaymentType | 'faster_payment' | 'credit';
  accountId: string;
}

const AS_OF = '2026-10-31';
const MONTHS = [5, 6, 7, 8, 9, 10];
const pad = (n: number) => String(n).padStart(2, '0');
const d = (m: number, day: number) => `2026-${pad(m)}-${pad(day)}`;

function addDays(date: string, days: number): string {
  const t = new Date(date + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

interface Stream {
  descriptor: string | string[];
  counterparty: string;
  amount: number | number[];
  account: string;
  type: PaymentType;
  monthly?: { day: number; months?: number[]; shift?: Record<number, number> };
  weekly?: { from: string; to: string };
  dates?: string[];
}

function expand(s: Stream): Tx[] {
  let dates: string[] = [];
  if (s.monthly) {
    const months = s.monthly.months ?? MONTHS;
    dates = months.map((m) => d(m, s.monthly!.shift?.[m] ?? s.monthly!.day));
  } else if (s.weekly) {
    for (let x = s.weekly.from; x <= s.weekly.to; x = addDays(x, 7)) dates.push(x);
  } else if (s.dates) {
    dates = s.dates;
  }
  return dates.map((date, i) => ({
    bookingDate: date,
    amount: -(Array.isArray(s.amount) ? s.amount[i] : s.amount),
    currency: 'GBP',
    descriptor: Array.isArray(s.descriptor) ? s.descriptor[i % s.descriptor.length] : s.descriptor,
    counterparty: s.counterparty,
    paymentType: s.type,
    accountId: s.account,
  }));
}

// Small seeded generator so the everyday noise is the same on every build.
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface NoiseSpec {
  seed: number;
  account: string;
  cardPrefix: string;
  grocer: string[];
  fuel: string;
  salary: { descriptor: string; amount: number; day: number };
  refund: { date: string; descriptor: string; amount: number };
}

function noise(n: NoiseSpec): Tx[] {
  const r = rng(n.seed);
  const out: Tx[] = [];
  const money = (lo: number, hi: number) => Math.round((lo + r() * (hi - lo)) * 100) / 100;
  const card = (date: string, desc: string, cp: string, amount: number): Tx => ({
    bookingDate: date,
    amount: -amount,
    currency: 'GBP',
    descriptor: n.cardPrefix + desc,
    counterparty: cp,
    paymentType: 'card',
    accountId: n.account,
  });
  for (let x = '2026-05-01'; x <= AS_OF; x = addDays(x, 1)) {
    const roll = r();
    if (roll < 0.26) out.push(card(x, n.grocer[Math.floor(r() * n.grocer.length)], 'Groceries', money(9, 138)));
    else if (roll < 0.33) out.push(card(x, n.fuel, 'Fuel', money(38, 79)));
    else if (roll < 0.36) out.push(card(x, `AMZN Mktp UK*${Math.floor(r() * 1e6).toString(36).toUpperCase()}`, 'Amazon', money(6, 64)));
    else if (roll < 0.39) out.push(card(x, 'DELIVEROO', 'Deliveroo', money(17, 46)));
  }
  for (const m of MONTHS) {
    out.push({
      bookingDate: d(m, n.salary.day),
      amount: n.salary.amount,
      currency: 'GBP',
      descriptor: n.salary.descriptor,
      counterparty: 'Employer',
      paymentType: 'credit',
      accountId: n.account,
    });
  }
  out.push({
    bookingDate: n.refund.date,
    amount: n.refund.amount,
    currency: 'GBP',
    descriptor: n.refund.descriptor,
    counterparty: 'Amazon',
    paymentType: 'credit',
    accountId: n.account,
  });
  return out;
}

interface Signal {
  payment: string;
  kind: 'keep' | 'identified' | 'shared' | 'not_shared' | 'unused' | 'unsure';
  service?: string;
}
interface Msg {
  id: string;
  at: string;
  from: 'member' | 'nous';
  author?: string;
  text: string;
  about?: string[]; // recurring payment ids this message is about
  signals?: Signal[];
  buttons?: string[];
}

interface HouseholdSpec {
  id: string;
  surname: string;
  mode: 'auto' | 'manual';
  member: string;
  accounts: { id: string; label: string }[];
  story: string;
  streams: Stream[];
  extra?: Tx[];
  noise: NoiseSpec;
  cancellations?: { payment: string; service: string; cancelledOn: string; source: string | null; finalBill?: { maxAmount: number; by: string } }[];
  trials?: { service: string; descriptor: string; account: string; startedOn: string; convertsOn: string; trialPrice: number; fullPrice: number; cadence: 'monthly' }[];
  bundles?: { parent: string; includes: string[]; source: string | null }[];
  chat: Msg[];
}

const households: HouseholdSpec[] = [
  {
    id: 'H1',
    surname: 'Okafor',
    mode: 'auto',
    member: 'Ngozi',
    accounts: [{ id: 'cur', label: 'Current account ••4417' }],
    story:
      'Two APPLE.COM/BILL streams: £2.99 the member identified as iCloud, £9.99 nobody has identified. Netflix billed directly and also inside the Sky bill. Readly the member says they stopped using.',
    streams: [
      { descriptor: 'APPLE.COM/BILL', counterparty: 'Apple', amount: 2.99, account: 'cur', type: 'card', monthly: { day: 3 } },
      { descriptor: 'APPLE.COM/BILL', counterparty: 'Apple', amount: 9.99, account: 'cur', type: 'card', monthly: { day: 17 } },
      { descriptor: 'NETFLIX.COM', counterparty: 'Netflix', amount: 12.99, account: 'cur', type: 'card', monthly: { day: 9 } },
      { descriptor: 'DD SKY DIGITAL', counterparty: 'Sky UK', amount: 58, account: 'cur', type: 'direct_debit', monthly: { day: 1, shift: { 8: 3 } } },
      { descriptor: 'READLY', counterparty: 'Readly', amount: 7.99, account: 'cur', type: 'card', monthly: { day: 22 } },
      { descriptor: ['Spotify P2F8K3QX1A', 'Spotify P2G1M7RT4C', 'Spotify P2H6V0LW8E', 'Spotify P2J3B9QZ2D', 'Spotify P2K8D4XN6F', 'Spotify P2L2T5HY9G'], counterparty: 'Spotify', amount: 11.99, account: 'cur', type: 'card', monthly: { day: 12 } },
      { descriptor: 'GOOGLE *YouTube', counterparty: 'Google', amount: 12.99, account: 'cur', type: 'card', monthly: { day: 25 } },
      { descriptor: 'DD OCTOPUS ENERGY', counterparty: 'Octopus Energy', amount: 96, account: 'cur', type: 'direct_debit', monthly: { day: 5 } },
      { descriptor: 'DD LB LEWISHAM CTAX', counterparty: 'London Borough of Lewisham', amount: 152, account: 'cur', type: 'direct_debit', monthly: { day: 1, shift: { 8: 3 } } },
      { descriptor: 'DD THAMES WATER', counterparty: 'Thames Water', amount: 34.5, account: 'cur', type: 'direct_debit', monthly: { day: 15 } },
      { descriptor: ['AMZNPrime*2K4L9X0Q4', 'AMZNPrime*R83KD1MZ0', 'AMZNPrime*7QW2C5HJ1', 'AMZNPrime*M1P6Z0TB8', 'AMZNPrime*HJ2V8N3K5', 'AMZNPrime*Q71HT2LD9'], counterparty: 'Amazon', amount: 8.99, account: 'cur', type: 'card', monthly: { day: 28 } },
    ],
    noise: { seed: 101, account: 'cur', cardPrefix: '', grocer: ['TESCO STORES 2041', 'SAINSBURYS S/MKTS', 'LIDL GB LEWISHAM'], fuel: 'SHELL LEWISHAM', salary: { descriptor: 'BGC HARGREAVE LTD SALARY', amount: 2480, day: 25 }, refund: { date: '2026-07-16', descriptor: 'AMZN Mktp UK refund', amount: 18.49 } },
    bundles: [{ parent: 'sky', includes: ['netflix'], source: 'm6' }],
    chat: [
      { id: 'm1', at: '2026-08-03T18:05:00', from: 'nous', about: ['apple_bill_299'], text: "Hi Ngozi, quick one. There's a £2.99 Apple charge every month. Do you know what it's for?", buttons: ['iCloud storage', 'Not sure'] },
      { id: 'm2', at: '2026-08-03T18:31:00', from: 'member', author: 'Ngozi', about: ['apple_bill_299'], text: 'its the icloud storage, keep that pls x', signals: [{ payment: 'apple_bill_299', kind: 'identified', service: 'icloud_plus' }, { payment: 'apple_bill_299', kind: 'keep' }] },
      { id: 'm3', at: '2026-09-20T19:10:00', from: 'nous', about: ['apple_bill_999'], text: "Thanks for sorting the iCloud one. There's also a separate £9.99 Apple charge every month. Any idea what that one is?" },
      { id: 'm4', at: '2026-09-20T21:42:00', from: 'member', author: 'Ngozi', about: ['apple_bill_999'], text: 'no idea tbh. one of the kids maybe? will ask them x', signals: [{ payment: 'apple_bill_999', kind: 'unsure' }] },
      { id: 'm5', at: '2026-09-27T21:12:00', from: 'member', author: 'Ngozi', about: ['readly'], text: 'we stopped using readly ages ago btw, cant remember the last time i opened it', signals: [{ payment: 'readly', kind: 'unused' }] },
      { id: 'm6', at: '2026-10-12T07:48:00', from: 'member', author: 'Ngozi', about: ['sky', 'netflix'], text: 'also think we get netflix thru the sky box?? kids watch it on there' },
    ],
  },
  {
    id: 'H2',
    surname: 'Patel',
    mode: 'manual',
    member: 'Priya',
    accounts: [
      { id: 'cur', label: 'Current account ••6630' },
      { id: 'cc', label: 'Credit card ••2290' },
    ],
    story:
      'Manual mode. Annual Amazon Prime renewed 3 days before the data ends. Disney+ went up in October after the member said keep it. A weekly HelloFresh box and a £1 SimplyCook trial converting in 6 days. Everything caps at FLAG.',
    streams: [
      { descriptor: ['AMZNPrime*T4K2R8P10', 'AMZNPrime*W9N3J6B27'], counterparty: 'Amazon', amount: 95, account: 'cc', type: 'card', dates: ['2025-10-28', '2026-10-28'] },
      { descriptor: 'DISNEY PLUS', counterparty: 'Disney+', amount: [9.99, 9.99, 9.99, 9.99, 9.99, 10.99], account: 'cur', type: 'card', monthly: { day: 19 } },
      { descriptor: 'HELLOFRESH', counterparty: 'HelloFresh', amount: 44.99, account: 'cur', type: 'card', weekly: { from: '2026-05-04', to: '2026-10-26' } },
      { descriptor: ['Spotify P3A7Q2WX5B', 'Spotify P3B1R8YK0C', 'Spotify P3C6S3ZN4D', 'Spotify P3D2T9AM7E', 'Spotify P3E8U4BL1F', 'Spotify P3F3V0CP6G'], counterparty: 'Spotify', amount: 11.99, account: 'cur', type: 'card', monthly: { day: 6 } },
      { descriptor: 'APPLE.COM/BILL', counterparty: 'Apple', amount: 0.99, account: 'cur', type: 'card', monthly: { day: 11 } },
      { descriptor: 'DD BIRMINGHAM CITY COUNCIL', counterparty: 'Birmingham City Council', amount: 141, account: 'cur', type: 'direct_debit', monthly: { day: 1, shift: { 8: 3 } } },
      { descriptor: 'DD BRITISH GAS', counterparty: 'British Gas', amount: 82, account: 'cur', type: 'direct_debit', monthly: { day: 12 } },
      { descriptor: 'PUREGYM', counterparty: 'PureGym', amount: 24.99, account: 'cur', type: 'card', monthly: { day: 2 } },
    ],
    extra: [{ bookingDate: '2026-10-23', amount: -1, currency: 'GBP', descriptor: 'SIMPLYCOOK', counterparty: 'SimplyCook', paymentType: 'card', accountId: 'cur' }],
    noise: { seed: 202, account: 'cur', cardPrefix: '', grocer: ['ASDA STORES 4419', 'TESCO STORES 3310', 'ALDI 61 BIRMINGHAM'], fuel: 'ESSO HALL GREEN', salary: { descriptor: 'BGC WMNHS SALARY', amount: 2215, day: 27 }, refund: { date: '2026-08-21', descriptor: 'AMZN Mktp UK refund', amount: 24.99 } },
    trials: [{ service: 'simplycook', descriptor: 'SIMPLYCOOK', account: 'cur', startedOn: '2026-10-23', convertsOn: '2026-11-06', trialPrice: 1, fullPrice: 12.99, cadence: 'monthly' }],
    chat: [
      { id: 'm1', at: '2026-06-14T20:02:00', from: 'member', author: 'Priya', text: 'Hi! Ive put it on manual, I like to see things before anything changes. Thanks' },
      { id: 'm2', at: '2026-06-14T20:03:00', from: 'nous', text: "Of course, Priya. We'll always ask before we change anything." },
      { id: 'm3', at: '2026-07-09T12:40:00', from: 'member', about: ['apple_bill_099'], author: 'Priya', text: 'the 99p apple one is icloud for my photos', signals: [{ payment: 'apple_bill_099', kind: 'identified', service: 'icloud_plus' }] },
      { id: 'm4', at: '2026-08-20T21:15:00', from: 'member', about: ['disney_plus'], author: 'Priya', text: 'disney is for the kids, keep it x', signals: [{ payment: 'disney_plus', kind: 'keep' }] },
    ],
  },
  {
    id: 'H3',
    surname: 'Byrne',
    mode: 'auto',
    member: 'Aoife',
    accounts: [{ id: 'cur', label: 'Current account ••0954' }],
    story:
      'A gym on a 12-month minimum term. Klarna instalments that look monthly. Council tax and energy direct debits. NOW cancelled on 2 September but still charging. Virgin Media bundle that includes Netflix, plus Netflix billed directly. A Duolingo trial converting in 12 days.',
    streams: [
      { descriptor: 'DD DAVID LLOYD CLUBS', counterparty: 'David Lloyd Leisure', amount: 89, account: 'cur', type: 'direct_debit', monthly: { day: 1, shift: { 8: 3 } } },
      { descriptor: 'CARD PAYMENT TO KLARNA*CURRYS', counterparty: 'Klarna', amount: 83.33, account: 'cur', type: 'card', monthly: { day: 14 } },
      { descriptor: 'CARD PAYMENT TO KLARNA*ASOS', counterparty: 'Klarna', amount: 23.32, account: 'cur', type: 'card', monthly: { day: 9, months: [8, 9, 10] } },
      { descriptor: 'DD BRISTOL CITY COUNCIL', counterparty: 'Bristol City Council', amount: 178, account: 'cur', type: 'direct_debit', monthly: { day: 1, shift: { 8: 3 } } },
      { descriptor: 'DD EDF ENERGY', counterparty: 'EDF Energy', amount: 120, account: 'cur', type: 'direct_debit', monthly: { day: 18 } },
      { descriptor: 'CARD PAYMENT TO NOWTV.COM', counterparty: 'NOW', amount: 9.99, account: 'cur', type: 'card', monthly: { day: 28 } },
      { descriptor: 'DD VIRGIN MEDIA', counterparty: 'Virgin Media', amount: 72, account: 'cur', type: 'direct_debit', monthly: { day: 20 } },
      { descriptor: 'CARD PAYMENT TO NETFLIX.COM', counterparty: 'Netflix', amount: 5.99, account: 'cur', type: 'card', monthly: { day: 11 } },
      { descriptor: 'CARD PAYMENT TO AMZN DIGITAL*KU', counterparty: 'Amazon', amount: 9.49, account: 'cur', type: 'card', monthly: { day: 7 } },
      { descriptor: ['CARD PAYMENT TO AMZNPrime*B6Y1E4Q82', 'CARD PAYMENT TO AMZNPrime*N0C7G3W51'], counterparty: 'Amazon', amount: 95, account: 'cur', type: 'card', dates: ['2025-06-15', '2026-06-15'] },
      { descriptor: ['CARD PAYMENT TO Spotify P4A1K9WQ3B', 'CARD PAYMENT TO Spotify P4B6L2XR8C', 'CARD PAYMENT TO Spotify P4C0M7YS2D', 'CARD PAYMENT TO Spotify P4D5N1ZT6E', 'CARD PAYMENT TO Spotify P4E9P6AU0F', 'CARD PAYMENT TO Spotify P4F3Q2BV5G'], counterparty: 'Spotify', amount: 11.99, account: 'cur', type: 'card', monthly: { day: 24 } },
    ],
    noise: { seed: 303, account: 'cur', cardPrefix: 'CARD PAYMENT TO ', grocer: ['TESCO STORES 5520', 'SAINSBURYS S/MKTS', 'LIDL GB BRISTOL'], fuel: 'SHELL FISHPONDS', salary: { descriptor: 'BGC AVONSIDE ENG SALARY', amount: 2640, day: 28 }, refund: { date: '2026-06-09', descriptor: 'AMZN Mktp UK refund', amount: 12.99 } },
    cancellations: [{ payment: 'now_tv', service: 'now_tv', cancelledOn: '2026-09-02', source: 'm1' }],
    trials: [{ service: 'duolingo', descriptor: 'CARD PAYMENT TO DUOLINGO', account: 'cur', startedOn: '2026-10-29', convertsOn: '2026-11-12', trialPrice: 0, fullPrice: 7.99, cadence: 'monthly' }],
    bundles: [{ parent: 'virgin_media', includes: ['netflix'], source: null }],
    chat: [
      { id: 'm1', at: '2026-09-02T19:20:00', from: 'member', about: ['now_tv'], author: 'Aoife', text: 'cancelled now tv today, footballs finished lol' },
      { id: 'm2', at: '2026-09-02T19:21:00', from: 'nous', about: ['now_tv'], text: "Thanks Aoife, noted. We'll keep an eye out for any more charges." },
      { id: 'm3', at: '2026-10-05T08:10:00', from: 'member', about: ['david_lloyd'], author: 'Aoife', text: 'is the gym one locked in? we signed up in january' },
      { id: 'm4', at: '2026-10-19T22:03:00', from: 'member', about: ['kindle_unlimited'], author: 'Aoife', text: 'kindle unlimited was from a free trial i forgot about, we dont use it', signals: [{ payment: 'kindle_unlimited', kind: 'unused' }] },
    ],
  },
  {
    id: 'H4',
    surname: 'Haddad',
    mode: 'auto',
    member: 'Layla',
    accounts: [
      { id: 'cur', label: 'Current account ••6120' },
      { id: 'cc', label: 'Credit card ••3391' },
    ],
    story:
      'A Paramount+ trial converting in 4 days. Spotify on the family tier. Microsoft 365 billed on two cards. An unidentified Google Play charge. The Times went up after the member said keep it. Deliveroo Plus the member says they no longer use.',
    streams: [
      { descriptor: ['Spotify P5A8C1DQ4H', 'Spotify P5B3D6ER9J', 'Spotify P5C7E0FS3K', 'Spotify P5D2F5GT8L', 'Spotify P5E6G9HU2M', 'Spotify P5F1H4JV7N'], counterparty: 'Spotify', amount: 19.99, account: 'cur', type: 'card', monthly: { day: 3 } },
      { descriptor: 'MICROSOFT*365 PERSONAL', counterparty: 'Microsoft', amount: 7.99, account: 'cur', type: 'card', monthly: { day: 8 } },
      { descriptor: 'MSFT *365 PERSONAL', counterparty: 'Microsoft', amount: 7.99, account: 'cc', type: 'card', monthly: { day: 21 } },
      { descriptor: 'GOOGLE *PLAY APPS', counterparty: 'Google', amount: 4.99, account: 'cur', type: 'card', monthly: { day: 16 } },
      { descriptor: 'TIMES & SUNDAY T', counterparty: 'Times Media', amount: [8, 8, 8, 8, 8, 9], account: 'cur', type: 'card', monthly: { day: 26 } },
      { descriptor: 'DD BRITISH GAS', counterparty: 'British Gas', amount: 105, account: 'cur', type: 'direct_debit', monthly: { day: 3, shift: { 5: 5 } } },
      { descriptor: 'DD EE LIMITED', counterparty: 'EE', amount: 25, account: 'cur', type: 'direct_debit', monthly: { day: 18 } },
      { descriptor: 'DELIVEROO PLUS', counterparty: 'Deliveroo', amount: 3.49, account: 'cur', type: 'card', monthly: { day: 13 } },
      { descriptor: 'DD LB CAMDEN CTAX', counterparty: 'London Borough of Camden', amount: 164, account: 'cur', type: 'direct_debit', monthly: { day: 1, shift: { 8: 3 } } },
    ],
    noise: { seed: 404, account: 'cur', cardPrefix: '', grocer: ['SAINSBURYS S/MKTS', 'TESCO EXPRESS 1187', 'ALDI 88 CAMDEN'], fuel: 'BP KENTISH TOWN', salary: { descriptor: 'BGC NORTHGATE DENTAL SALARY', amount: 2950, day: 26 }, refund: { date: '2026-09-04', descriptor: 'AMZN Mktp UK refund', amount: 31.5 } },
    trials: [{ service: 'paramount_plus', descriptor: 'PARAMOUNT+', account: 'cc', startedOn: '2026-10-28', convertsOn: '2026-11-04', trialPrice: 0, fullPrice: 6.99, cadence: 'monthly' }],
    chat: [
      { id: 'm1', at: '2026-09-01T07:15:00', from: 'member', about: ['the_times'], author: 'Layla', text: 'keep the times pls, omar reads it every morning', signals: [{ payment: 'the_times', kind: 'keep' }] },
      { id: 'm2', at: '2026-09-01T07:16:00', from: 'nous', about: ['the_times'], text: 'Will do, Layla.' },
      { id: 'm3', at: '2026-10-08T13:30:00', from: 'member', about: ['microsoft_365_cur', 'microsoft_365_cc'], author: 'Layla', text: "what's the microsoft thing? i thought we only had one" },
      { id: 'm4', at: '2026-10-22T20:44:00', from: 'member', about: ['deliveroo_plus'], author: 'Layla', text: 'we havent used deliveroo since the summer tbh', signals: [{ payment: 'deliveroo_plus', kind: 'unused' }] },
    ],
  },
  {
    id: 'H5',
    surname: 'Walsh',
    mode: 'auto',
    member: 'Claire',
    accounts: [{ id: 'cur', label: 'Current account ••2785' }],
    story:
      'Disney+ cancelled on 14 September and charged again on 14 October. Audible: member said keep it 30 days ago. BritBox cancelled with one legitimate pro-rata final bill. Spotify Duo. A Strava trial that has already converted. Picsart and MUBI the member says can go.',
    streams: [
      { descriptor: 'CARD PAYMENT TO DISNEY PLUS', counterparty: 'Disney+', amount: 8.99, account: 'cur', type: 'card', monthly: { day: 14 } },
      { descriptor: 'CARD PAYMENT TO AUDIBLE UK', counterparty: 'Audible', amount: 7.99, account: 'cur', type: 'card', monthly: { day: 4 } },
      { descriptor: 'CARD PAYMENT TO BRITBOX', counterparty: 'BritBox', amount: 5.99, account: 'cur', type: 'card', monthly: { day: 6, months: [5, 6, 7, 8, 9] } },
      { descriptor: ['CARD PAYMENT TO Spotify P6A4K8LW2P', 'CARD PAYMENT TO Spotify P6B9L3MX7Q', 'CARD PAYMENT TO Spotify P6C3M7NY1R', 'CARD PAYMENT TO Spotify P6D8N2PZ6S', 'CARD PAYMENT TO Spotify P6E2P6QA0T', 'CARD PAYMENT TO Spotify P6F7Q1RB5U'], counterparty: 'Spotify', amount: 16.99, account: 'cur', type: 'card', monthly: { day: 21 } },
      { descriptor: 'DD ADMIRAL INSURANCE', counterparty: 'Admiral', amount: 42, account: 'cur', type: 'direct_debit', monthly: { day: 10 } },
      { descriptor: 'DD SEVERN TRENT', counterparty: 'Severn Trent Water', amount: 38, account: 'cur', type: 'direct_debit', monthly: { day: 15 } },
      { descriptor: 'CARD PAYMENT TO PICSART', counterparty: 'Picsart', amount: 4.99, account: 'cur', type: 'card', monthly: { day: 9 } },
      { descriptor: 'CARD PAYMENT TO MUBI', counterparty: 'MUBI', amount: 10.99, account: 'cur', type: 'card', monthly: { day: 27 } },
      { descriptor: ['CARD PAYMENT TO AMZNPrime*D3F7H1K59', 'CARD PAYMENT TO AMZNPrime*E8G2J6L04', 'CARD PAYMENT TO AMZNPrime*F2H7K0M38', 'CARD PAYMENT TO AMZNPrime*G7J1L5N83', 'CARD PAYMENT TO AMZNPrime*H1K6M9P27', 'CARD PAYMENT TO AMZNPrime*J6L0N4Q72'], counterparty: 'Amazon', amount: 8.99, account: 'cur', type: 'card', monthly: { day: 2 } },
    ],
    extra: [
      { bookingDate: '2026-10-06', amount: -3.2, currency: 'GBP', descriptor: 'CARD PAYMENT TO BRITBOX', counterparty: 'BritBox', paymentType: 'card', accountId: 'cur' },
      { bookingDate: '2026-10-20', amount: -6.99, currency: 'GBP', descriptor: 'CARD PAYMENT TO STRAVA', counterparty: 'Strava', paymentType: 'card', accountId: 'cur' },
    ],
    noise: { seed: 505, account: 'cur', cardPrefix: 'CARD PAYMENT TO ', grocer: ['TESCO STORES 2876', 'ASDA STORES 4102', 'LIDL GB DERBY'], fuel: 'ESSO MICKLEOVER', salary: { descriptor: 'BGC DERBYSHIRE CC SALARY', amount: 2105, day: 28 }, refund: { date: '2026-08-12', descriptor: 'AMZN Mktp UK refund', amount: 9.99 } },
    cancellations: [
      { payment: 'disney_plus', service: 'disney_plus', cancelledOn: '2026-09-14', source: 'm1' },
      { payment: 'britbox', service: 'britbox', cancelledOn: '2026-10-02', source: 'm4', finalBill: { maxAmount: 5.99, by: '2026-10-31' } },
    ],
    trials: [{ service: 'strava', descriptor: 'CARD PAYMENT TO STRAVA', account: 'cur', startedOn: '2026-09-20', convertsOn: '2026-10-20', trialPrice: 0, fullPrice: 6.99, cadence: 'monthly' }],
    chat: [
      { id: 'm1', at: '2026-09-14T21:00:00', from: 'member', about: ['disney_plus'], author: 'Claire', text: 'Cancelled disney today, nobody watches it anymore' },
      { id: 'm2', at: '2026-09-14T21:01:00', from: 'nous', about: ['disney_plus'], text: "Thanks Claire. We've made a note." },
      { id: 'm3', at: '2026-10-01T08:22:00', from: 'member', about: ['audible'], author: 'Claire', text: 'Leave audible pls, I listen on the school run x', signals: [{ payment: 'audible', kind: 'keep' }] },
      { id: 'm4', at: '2026-10-02T19:47:00', from: 'member', about: ['britbox'], author: 'Claire', text: "cancelled britbox too. they said there's one last bill" },
      { id: 'm5', at: '2026-10-17T22:30:00', from: 'member', about: ['picsart'], author: 'Claire', text: 'the photo app was for a school project, dont need it now', signals: [{ payment: 'picsart', kind: 'unused' }] },
      { id: 'm6', at: '2026-10-25T21:05:00', from: 'member', about: ['mubi'], author: 'Claire', text: 'and mubi was for my film course which finished. can go x', signals: [{ payment: 'mubi', kind: 'unused' }] },
    ],
  },
  {
    id: 'H6',
    surname: 'Nwosu',
    mode: 'manual',
    member: 'Tunde',
    accounts: [
      { id: 'cur', label: 'Current account ••5068' },
      { id: 'cc', label: 'Credit card ••7714' },
    ],
    story:
      'Manual mode. An unidentified PAYPAL *JGSOFTWARE. Adobe Creative Cloud renewed annually on 20 October. Paramount+ charged after cancelling in July and already refunded. Dropbox on two cards. A £1 Telegraph trial converting in 2 days. Netflix the member shares with their sister.',
    streams: [
      { descriptor: 'PAYPAL *JGSOFTWARE', counterparty: 'PayPal', amount: 14, account: 'cur', type: 'card', monthly: { day: 19 } },
      { descriptor: 'ADOBE SYSTEMS SOFTWARE', counterparty: 'Adobe', amount: 239.88, account: 'cc', type: 'card', dates: ['2025-10-20', '2026-10-20'] },
      { descriptor: 'PARAMOUNT+', counterparty: 'Paramount+', amount: 6.99, account: 'cur', type: 'card', monthly: { day: 22, months: [5, 6, 7] } },
      { descriptor: 'DROPBOX*PLUS', counterparty: 'Dropbox', amount: 9.99, account: 'cur', type: 'card', monthly: { day: 5 } },
      { descriptor: 'DROPBOX', counterparty: 'Dropbox', amount: 9.99, account: 'cc', type: 'card', monthly: { day: 26 } },
      { descriptor: 'DD SOUTHWARK CTAX', counterparty: 'London Borough of Southwark', amount: 158, account: 'cur', type: 'direct_debit', monthly: { day: 1, shift: { 8: 3 } } },
      { descriptor: 'DD OVO ENERGY', counterparty: 'OVO Energy', amount: 92, account: 'cur', type: 'direct_debit', monthly: { day: 7 } },
      { descriptor: 'NETFLIX.COM', counterparty: 'Netflix', amount: 12.99, account: 'cur', type: 'card', monthly: { day: 12 } },
    ],
    extra: [
      { bookingDate: '2026-07-29', amount: 6.99, currency: 'GBP', descriptor: 'PARAMOUNT+ REFUND', counterparty: 'Paramount+', paymentType: 'credit', accountId: 'cur' },
      { bookingDate: '2026-08-02', amount: -1, currency: 'GBP', descriptor: 'THE TELEGRAPH', counterparty: 'Telegraph Media Group', paymentType: 'card', accountId: 'cur' },
    ],
    noise: { seed: 606, account: 'cur', cardPrefix: '', grocer: ['SAINSBURYS S/MKTS', 'TESCO STORES 6114', 'LIDL GB PECKHAM'], fuel: 'SHELL PECKHAM', salary: { descriptor: 'BGC KINGSGATE FM SALARY', amount: 3120, day: 24 }, refund: { date: '2026-09-18', descriptor: 'AMZN Mktp UK refund', amount: 22.0 } },
    cancellations: [{ payment: 'paramount_plus', service: 'paramount_plus', cancelledOn: '2026-07-05', source: null }],
    trials: [{ service: 'the_telegraph', descriptor: 'THE TELEGRAPH', account: 'cur', startedOn: '2026-08-02', convertsOn: '2026-11-02', trialPrice: 1, fullPrice: 9.0, cadence: 'monthly' }],
    chat: [
      { id: 'm1', at: '2026-07-23T09:14:00', from: 'member', about: ['paramount_plus'], author: 'Tunde', text: 'paramount charged me again after i cancelled??' },
      { id: 'm2', at: '2026-07-23T09:40:00', from: 'nous', about: ['paramount_plus'], text: "Sorry Tunde, that shouldn't happen. We've asked Paramount+ for a refund and we'll let you know." },
      { id: 'm3', at: '2026-07-29T16:02:00', from: 'nous', about: ['paramount_plus'], text: 'Good news: Paramount+ refunded the £6.99.' },
      { id: 'm4', at: '2026-07-29T16:30:00', from: 'member', about: ['paramount_plus'], author: 'Tunde', text: 'cheers 👍' },
      { id: 'm5', at: '2026-10-03T18:55:00', from: 'member', about: ['netflix'], author: 'Tunde', text: 'the netflix is shared with my sister, she pays me half', signals: [{ payment: 'netflix', kind: 'shared' }] },
    ],
  },
];

const root = new URL('../fixtures/households/', import.meta.url).pathname;
for (const h of households) {
  const txs = [...h.streams.flatMap(expand), ...(h.extra ?? []), ...noise(h.noise)]
    .filter((t) => t.bookingDate <= AS_OF)
    .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate) || a.descriptor.localeCompare(b.descriptor) || a.amount - b.amount)
    .map((t, i) => ({ id: `${h.id}-${String(i + 1).padStart(4, '0')}`, ...t }));
  const dir = join(root, h.id);
  mkdirSync(dir, { recursive: true });
  const household = {
    id: h.id,
    surname: h.surname,
    member: h.member,
    mode: h.mode,
    asOf: AS_OF,
    accounts: h.accounts,
    story: h.story,
    cancellations: h.cancellations ?? [],
    trials: h.trials ?? [],
    bundles: h.bundles ?? [],
  };
  writeFileSync(join(dir, 'household.json'), JSON.stringify(household, null, 2) + '\n');
  writeFileSync(join(dir, 'transactions.json'), JSON.stringify(txs, null, 2) + '\n');
  writeFileSync(join(dir, 'chat.json'), JSON.stringify(h.chat, null, 2) + '\n');
  console.log(`${h.id} ${h.surname}: ${txs.length} transactions, ${h.chat.length} messages`);
}
