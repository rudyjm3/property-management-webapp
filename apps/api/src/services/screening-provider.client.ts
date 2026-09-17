import { randomUUID } from 'crypto';

/**
 * Background/credit screening provider integration (Module 1 — Advanced
 * Tenant Onboarding). TransUnion SmartMove is the provider named in
 * BUILD_OUTLINE.md §14.
 *
 * STATUS: the real TransUnion SmartMove API call is NOT wired up — this
 * environment has no SmartMove credentials. `getScreeningProviderClient()`
 * falls back to `MockTransUnionSmartMoveClient`, which fabricates a
 * deterministic-shaped result without contacting any external service, so
 * the rest of the screening flow (consent gate, storage, approve/deny UI)
 * can be built and tested end-to-end now. `TransUnionSmartMoveClient` below
 * sketches the real integration point; its request/response shape is
 * unverified against TransUnion's actual API contract and MUST be confirmed
 * against their docs once credentials are provisioned, before it is trusted
 * in production. Swap it in by setting TRANSUNION_API_KEY + TRANSUNION_API_BASE_URL.
 *
 * Callers must never log `ScreeningApplicantInput` — it carries the
 * applicant's plaintext SSN and government ID for the duration of a single
 * outbound request only.
 */

export interface ScreeningApplicantInput {
  fullName: string;
  email: string;
  dateOfBirth: string | null;
  currentAddress: string | null;
  ssnFull: string;
  govtIdType: string | null;
  govtIdNumber: string;
}

export type ScreeningResultStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type ScreeningResultDecision = 'recommend' | 'caution' | 'decline';

export interface ScreeningSubmitResult {
  providerReferenceId: string;
  status: ScreeningResultStatus;
  decision?: ScreeningResultDecision;
  reportUrl?: string | null;
  errorMessage?: string | null;
}

export interface ScreeningProviderClient {
  submitCheck(input: ScreeningApplicantInput): Promise<ScreeningSubmitResult>;
}

/**
 * Mock implementation — always "succeeds" with a recommend decision and a
 * synthetic reference id. Used whenever TransUnion credentials aren't
 * configured (every environment today). Never makes a network call.
 */
export class MockTransUnionSmartMoveClient implements ScreeningProviderClient {
  async submitCheck(_input: ScreeningApplicantInput): Promise<ScreeningSubmitResult> {
    return {
      providerReferenceId: `MOCK-${randomUUID()}`,
      status: 'completed',
      decision: 'recommend',
      reportUrl: null,
    };
  }
}

/**
 * Real TransUnion SmartMove client — UNVERIFIED against the live API.
 * TODO(module-1): confirm the actual SmartMove request/response contract
 * (endpoint path, auth scheme, field names) against TransUnion's own docs
 * once credentials are available, and adjust this method accordingly.
 */
export class TransUnionSmartMoveClient implements ScreeningProviderClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string
  ) {}

  async submitCheck(input: ScreeningApplicantInput): Promise<ScreeningSubmitResult> {
    const res = await fetch(`${this.baseUrl}/screening-requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        applicant: {
          full_name: input.fullName,
          email: input.email,
          date_of_birth: input.dateOfBirth,
          address: input.currentAddress,
          ssn: input.ssnFull,
          government_id: { type: input.govtIdType, number: input.govtIdNumber },
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`TransUnion SmartMove request failed with status ${res.status}`);
    }

    const data = (await res.json()) as {
      id: string;
      status: string;
      recommendation?: string;
      report_url?: string | null;
    };

    return {
      providerReferenceId: data.id,
      status: mapProviderStatus(data.status),
      decision: mapProviderDecision(data.recommendation),
      reportUrl: data.report_url ?? null,
    };
  }
}

function mapProviderStatus(raw: string): ScreeningResultStatus {
  switch (raw) {
    case 'complete':
    case 'completed':
      return 'completed';
    case 'processing':
    case 'in_progress':
      return 'in_progress';
    case 'failed':
    case 'error':
      return 'failed';
    default:
      return 'pending';
  }
}

function mapProviderDecision(raw: string | undefined): ScreeningResultDecision | undefined {
  switch (raw) {
    case 'recommend':
    case 'approved':
      return 'recommend';
    case 'caution':
    case 'approved_with_conditions':
      return 'caution';
    case 'decline':
    case 'not_recommended':
      return 'decline';
    default:
      return undefined;
  }
}

export function getScreeningProviderClient(): ScreeningProviderClient {
  const apiKey = process.env.TRANSUNION_API_KEY;
  const baseUrl = process.env.TRANSUNION_API_BASE_URL;

  if (apiKey && baseUrl) {
    return new TransUnionSmartMoveClient(apiKey, baseUrl);
  }

  return new MockTransUnionSmartMoveClient();
}
