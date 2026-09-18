// Eviction Management (Module 8) — seed data for StateEvictionRule.
//
// ⚠️ REFERENCE DATA, NOT VERIFIED LEGAL ADVICE. Read this before editing or
// trusting these numbers:
//
// This table was assembled from general US landlord-tenant law domain
// knowledge, cross-checked against whatever legal-reference search-result
// snippets were reachable while building this module. It was NOT compiled by
// fetching and reading primary statute text for all 51 jurisdictions — this
// build's sandboxed environment blocked outbound access to every legal-
// reference site attempted (nolo.com, ipropertymanagement.com,
// law.cornell.edu, evictionrules.com all returned network-egress errors), so
// there was no way to pull authoritative full tables during this session.
// Treat every row here as a reasonable starting point that MUST be confirmed
// against the current statute for that state (and, for cure/unconditional-
// quit periods especially, against the specific violation type — many states
// vary the period by what the tenant is being accused of) before it's relied
// on for an actual eviction. `source` and `lastVerifiedAt` on each seeded
// StateEvictionRule row exist so this stays flagged for periodic legal
// review — populating them is not itself a claim that a lawyer has checked
// this data. See docs/reference/modules.md "Module 8" for the full writeup.
//
// Delivery methods are intentionally NOT varied per state beyond the generic
// set below — the app's data model only tracks certified_mail /
// personal_service / posting as single values (it doesn't model, e.g.,
// "posting valid only if combined with mailing"), and the exact conditions
// under which each is valid vary by state in ways not safely reducible to a
// one-of-three-values field. Rather than assert a specific state disallows a
// method (a claim this build has no way to verify), every row allows all
// three and defers nuance to `notes` where something specific is known.

// Mirrors EVICTION_NOTICE_TYPES / EVICTION_DELIVERY_METHODS in ./index —
// defined locally (rather than imported) to avoid a circular import, since
// this file is re-exported from that same index.
type EvictionNoticeType = 'pay_or_quit' | 'cure_or_quit' | 'unconditional_quit';
type EvictionDeliveryMethod = 'certified_mail' | 'personal_service' | 'posting';

export interface StateEvictionRuleSeed {
  state: string;
  noticeType: EvictionNoticeType;
  noticePeriodDays: number;
  allowedDeliveryMethods: EvictionDeliveryMethod[];
  notes: string | null;
  source: string;
}

const ALL_DELIVERY_METHODS: EvictionDeliveryMethod[] = ['certified_mail', 'personal_service', 'posting'];

const GENERAL_SOURCE =
  'Aggregated from general US landlord-tenant law secondary sources during this build; not independently verified against current statute text for this state — see docs/reference/modules.md for the sourcing caveat and STATE_EVICTION_DATA_COMPILED_AT.';

// The date this table was assembled (not a claim of legal verification —
// see the module-level comment above).
export const STATE_EVICTION_DATA_COMPILED_AT = '2026-09-18';

interface StateRow {
  state: string;
  pay: number;
  cure: number;
  uq: number;
  notes?: Partial<Record<EvictionNoticeType, string>> | null;
}

// Notice period, in days, for each of the three notice types, per
// jurisdiction. Days are simple calendar-day counts (see the schema comment
// on Eviction.deadlineDate for the weekend/holiday-counting simplification).
const STATE_ROWS: StateRow[] = [
  { state: 'AL', pay: 7, cure: 14, uq: 14 },
  { state: 'AK', pay: 7, cure: 10, uq: 5 },
  { state: 'AZ', pay: 5, cure: 10, uq: 5 },
  { state: 'AR', pay: 3, cure: 14, uq: 3, notes: { pay_or_quit: 'Arkansas landlord-tenant law is unusually thin relative to most states; confirm current procedure, including whether the criminal failure-to-vacate statute still applies in your jurisdiction.' } },
  { state: 'CA', pay: 3, cure: 3, uq: 3, notes: { pay_or_quit: 'CCP §1161(2) — the notice may not demand anything beyond rent actually owed.' } },
  { state: 'CO', pay: 10, cure: 10, uq: 3, notes: { pay_or_quit: "Colorado's nonpayment notice period was extended from 3 to 10 days by state legislation in recent years — confirm the current figure hasn't changed again." } },
  { state: 'CT', pay: 3, cure: 15, uq: 3, notes: { cure_or_quit: 'Conn. Gen. Stat. §47a-15 gives a 15-day cure window for lease violations before a notice to quit may issue.' } },
  { state: 'DE', pay: 5, cure: 7, uq: 7, notes: null },
  { state: 'DC', pay: 30, cure: 30, uq: 30, notes: { pay_or_quit: "DC's tenant-protective Rental Housing Act framework has changed notice requirements repeatedly in recent years — treat all three DC figures as low-confidence and confirm current OAG/DHCD guidance before use." } },
  { state: 'FL', pay: 3, cure: 7, uq: 7, notes: { pay_or_quit: 'Fla. Stat. §83.56 — the 3 days excludes Saturdays, Sundays, and legal holidays (not a pure calendar-day count); this app computes deadlineDate as calendar days, so treat the computed date as a floor, not exact.' } },
  { state: 'GA', pay: 3, cure: 3, uq: 3, notes: { pay_or_quit: 'Georgia does not fix a statutory minimum notice period for nonpayment — a demand for possession is required before filing, but no specific number of days is set by statute. 3 days is shown as a common, conservative practice, not a statutory minimum.' } },
  { state: 'HI', pay: 5, cure: 10, uq: 5, notes: null },
  { state: 'ID', pay: 3, cure: 3, uq: 3, notes: null },
  { state: 'IL', pay: 5, cure: 10, uq: 5, notes: null },
  { state: 'IN', pay: 10, cure: 10, uq: 10, notes: { cure_or_quit: 'Indiana has no comprehensive statewide URLTA; cure/unconditional periods are largely lease-driven — 10 days shown as a common default, confirm against the specific lease and any local ordinance.' } },
  { state: 'IA', pay: 3, cure: 7, uq: 3, notes: null },
  { state: 'KS', pay: 3, cure: 14, uq: 3, notes: null },
  { state: 'KY', pay: 7, cure: 14, uq: 14, notes: { pay_or_quit: 'Kentucky only has a statewide URLTA in counties that have adopted it; confirm whether the property\'s county has adopted KRS Ch. 383A before relying on this figure.' } },
  { state: 'LA', pay: 5, cure: 5, uq: 5, notes: null },
  { state: 'ME', pay: 7, cure: 7, uq: 7, notes: null },
  { state: 'MD', pay: 0, cure: 30, uq: 14, notes: { pay_or_quit: 'Maryland does not require a pre-filing notice for nonpayment of rent — a "Failure to Pay Rent" case may be filed the day after rent is due and unpaid. 0 reflects that, not a data gap.' } },
  { state: 'MA', pay: 14, cure: 7, uq: 7, notes: { pay_or_quit: 'Mass. Gen. Laws c.186 §11/§12.' } },
  { state: 'MI', pay: 7, cure: 30, uq: 7, notes: null },
  { state: 'MN', pay: 14, cure: 14, uq: 14, notes: null },
  { state: 'MS', pay: 3, cure: 30, uq: 30, notes: null },
  { state: 'MO', pay: 5, cure: 10, uq: 10, notes: { pay_or_quit: 'Missouri does not fix a statutory minimum pre-filing notice period for nonpayment (rent-and-possession actions); 5 days is shown as common practice, not a statutory minimum.' } },
  { state: 'MT', pay: 3, cure: 14, uq: 3, notes: null },
  { state: 'NE', pay: 7, cure: 30, uq: 14, notes: null },
  { state: 'NV', pay: 7, cure: 5, uq: 3, notes: { pay_or_quit: 'Nevada counts in judicial days for the nonpayment notice (NRS 40.253) — confirm whether weekends/court holidays extend the period in your filing.' } },
  { state: 'NH', pay: 7, cure: 7, uq: 7, notes: null },
  { state: 'NJ', pay: 3, cure: 30, uq: 3, notes: { pay_or_quit: "New Jersey's Anti-Eviction Act does not require a pre-suit notice for nonpayment; 3 days is shown as common practice, not a statutory minimum." } },
  { state: 'NM', pay: 3, cure: 7, uq: 7, notes: null },
  { state: 'NY', pay: 14, cure: 10, uq: 10, notes: { pay_or_quit: 'RPAPL §711; NYC and some other localities layer additional local requirements on top of state law — check local rules separately.' } },
  { state: 'NC', pay: 10, cure: 10, uq: 10, notes: { pay_or_quit: 'North Carolina does not fix a statutory minimum notice period for nonpayment absent a lease term requiring one; 10 days is shown as common practice.' } },
  { state: 'ND', pay: 3, cure: 3, uq: 3, notes: null },
  { state: 'OH', pay: 3, cure: 3, uq: 3, notes: null },
  { state: 'OK', pay: 5, cure: 15, uq: 5, notes: null },
  { state: 'OR', pay: 6, cure: 14, uq: 1, notes: { pay_or_quit: 'Oregon uses a graduated nonpayment schedule under ORS 90.394 (72 hours if rent is 8+ days late, 144 hours/6 days if 5-8 days late) rather than a single fixed period — 6 days shown is the more common case; verify against the actual days-late count.', cure_or_quit: 'ORS 90.392 — 30-day termination notice with a 14-day window to cure; 14 shown is the cure window, not the total notice period.', unconditional_quit: "ORS 90.396 — as short as 24 hours for the statute's specific non-curable ('outrageous conduct') grounds; confirm the exact ground before relying on a 1-day figure." } },
  { state: 'PA', pay: 10, cure: 15, uq: 10, notes: { pay_or_quit: '68 P.S. §250.501 sets 10 days as the statutory minimum for nonpayment.' } },
  { state: 'RI', pay: 5, cure: 20, uq: 5, notes: { cure_or_quit: 'R.I. Gen. Laws §34-18-36 — 20 days to remedy a material lease breach.' } },
  { state: 'SC', pay: 5, cure: 14, uq: 14, notes: null },
  { state: 'SD', pay: 3, cure: 3, uq: 3, notes: null },
  { state: 'TN', pay: 14, cure: 30, uq: 14, notes: { cure_or_quit: 'Tennessee URLTA counties (Tenn. Code §66-28-505): 14-day cure notice, lease terminates on day 30 if not cured; non-URLTA counties differ — confirm whether the property\'s county has adopted the URLTA.' } },
  { state: 'TX', pay: 3, cure: 3, uq: 3, notes: { pay_or_quit: 'Tex. Prop. Code §24.005 — 3 days is the statutory default; a written lease may specify a different period, which controls if present.' } },
  { state: 'UT', pay: 5, cure: 5, uq: 3, notes: null },
  { state: 'VT', pay: 14, cure: 30, uq: 14, notes: { pay_or_quit: '9 V.S.A. §4467.' } },
  { state: 'VA', pay: 5, cure: 21, uq: 30, notes: { cure_or_quit: "Virginia's well-known '21/30' structure: tenant has 21 days to cure; if uncured, the tenancy terminates on day 30. 21 shown here is the cure window, not the full notice-to-termination period.", unconditional_quit: 'Non-curable breaches under Va. Code §55.1-1245 also run on a 30-day notice, without the 21-day cure option.' } },
  { state: 'WA', pay: 14, cure: 10, uq: 3, notes: { pay_or_quit: "Washington's nonpayment notice period was extended from 3 to 14 days by a 2021 law change (RCW 59.18.410) — confirm this hasn't changed again since." } },
  { state: 'WV', pay: 3, cure: 30, uq: 14, notes: { pay_or_quit: 'West Virginia has no comprehensive statewide landlord-tenant act; notice requirements are largely lease- and locality-driven. Treat all three West Virginia figures as low-confidence defaults, not statutory minimums.' } },
  { state: 'WI', pay: 5, cure: 5, uq: 14, notes: { pay_or_quit: 'Wis. Stat. §704.17(2) — 5 days is standard; a 14-day unconditional notice applies instead if the tenant has had 3+ prior late-rent notices within the past year (§704.17(2)(b)).' } },
  { state: 'WY', pay: 3, cure: 3, uq: 3, notes: null },
];

function buildRow(state: string, noticeType: EvictionNoticeType, days: number, note: string | null | undefined): StateEvictionRuleSeed {
  return {
    state,
    noticeType,
    noticePeriodDays: days,
    allowedDeliveryMethods: ALL_DELIVERY_METHODS,
    notes: note ?? null,
    source: GENERAL_SOURCE,
  };
}

export const STATE_EVICTION_RULES_SEED: StateEvictionRuleSeed[] = STATE_ROWS.flatMap((row) => [
  buildRow(row.state, 'pay_or_quit', row.pay, row.notes?.pay_or_quit),
  buildRow(row.state, 'cure_or_quit', row.cure, row.notes?.cure_or_quit),
  buildRow(row.state, 'unconditional_quit', row.uq, row.notes?.unconditional_quit),
]);
