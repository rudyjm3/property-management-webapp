import { prisma, Prisma, ScreeningStatus, ScreeningDecision, GovernmentIdType } from '@propflow/db';
import { MODULE_KEYS } from '@propflow/shared';
import { AppError } from '../middleware/error-handler';
import { encryptField, decryptField } from './encryption.service';
import { getScreeningProviderClient } from './screening-provider.client';

/**
 * Screening service (Module 1 — Advanced Tenant Onboarding). Handles
 * consent capture + encryption of SSN/govt ID on a RentalApplication, and
 * running a background/credit check once consent is on file. Never returns
 * or logs decrypted SSN/govt ID — those are decrypted only transiently,
 * in-memory, for the duration of the provider call in `runScreeningCheck`.
 */

export interface ScreeningConsentInput {
  ssnFull: string;
  govtIdType: string;
  govtIdNumber: string;
}

/**
 * Builds the RentalApplication update fields for a screening-consent
 * submission. Called from rental-application.service.submitApplication so
 * consent + SSN/govt ID land in the same write as the rest of the
 * application. Returns `{}` (no-op) when the applicant didn't go through
 * the screening step. Throws if consent was given but the org doesn't have
 * Module 1 active — defense in depth behind the frontend's own gate.
 */
export function buildScreeningConsentUpdate(
  activeModules: string[],
  input: ScreeningConsentInput | undefined,
  ip: string
): Prisma.RentalApplicationUpdateInput {
  if (!input) return {};

  if (!activeModules.includes(MODULE_KEYS.ADVANCED_TENANT_ONBOARDING)) {
    throw new AppError(
      403,
      'MODULE_NOT_ACTIVE',
      'Background/credit screening is not enabled for this organization.'
    );
  }

  return {
    screeningConsentAt: new Date(),
    screeningConsentIp: ip,
    ssnFullEncrypted: encryptField(input.ssnFull),
    govtIdType: input.govtIdType as GovernmentIdType,
    govtIdNumber: encryptField(input.govtIdNumber),
  };
}

export async function runScreeningCheck(orgId: string, applicationId: string, userId: string) {
  const app = await prisma.rentalApplication.findFirst({
    where: { id: applicationId, organizationId: orgId },
    select: {
      id: true,
      applicantName: true,
      applicantEmail: true,
      dateOfBirth: true,
      currentAddress: true,
      screeningConsentAt: true,
      ssnFullEncrypted: true,
      govtIdType: true,
      govtIdNumber: true,
    },
  });
  if (!app) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application not found.');

  if (!app.screeningConsentAt) {
    throw new AppError(
      409,
      'SCREENING_CONSENT_REQUIRED',
      'The applicant must consent to a background/credit check before one can be run.'
    );
  }
  if (!app.ssnFullEncrypted || !app.govtIdNumber) {
    throw new AppError(
      409,
      'SCREENING_DATA_MISSING',
      'SSN and government ID are required before running a screening check.'
    );
  }

  const check = await prisma.screeningCheck.create({
    data: {
      organizationId: orgId,
      rentalApplicationId: applicationId,
      status: 'in_progress',
      requestedByUserId: userId,
    },
  });

  const client = getScreeningProviderClient();

  try {
    const ssnFull = decryptField(app.ssnFullEncrypted);
    const govtIdNumber = decryptField(app.govtIdNumber);

    const result = await client.submitCheck({
      fullName: app.applicantName,
      email: app.applicantEmail,
      dateOfBirth: app.dateOfBirth ? app.dateOfBirth.toISOString().slice(0, 10) : null,
      currentAddress: app.currentAddress,
      ssnFull,
      govtIdType: app.govtIdType,
      govtIdNumber,
    });

    const updated = await prisma.screeningCheck.update({
      where: { id: check.id },
      data: {
        status: result.status as ScreeningStatus,
        decision: (result.decision ?? null) as ScreeningDecision | null,
        providerReferenceId: result.providerReferenceId,
        reportUrl: result.reportUrl ?? null,
        errorMessage: result.errorMessage ?? null,
        completedAt: result.status === 'completed' || result.status === 'failed' ? new Date() : null,
      },
    });

    return summarize(updated);
  } catch (err) {
    const updated = await prisma.screeningCheck.update({
      where: { id: check.id },
      data: {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Screening provider request failed.',
        completedAt: new Date(),
      },
    });
    return summarize(updated);
  }
}

export async function getScreeningForApplication(orgId: string, applicationId: string) {
  const app = await prisma.rentalApplication.findFirst({
    where: { id: applicationId, organizationId: orgId },
    select: { screeningConsentAt: true },
  });
  if (!app) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application not found.');

  const latest = await prisma.screeningCheck.findFirst({
    where: { rentalApplicationId: applicationId, organizationId: orgId },
    orderBy: { requestedAt: 'desc' },
  });

  return {
    screeningConsentAt: app.screeningConsentAt,
    check: latest ? summarize(latest) : null,
  };
}

function summarize(check: {
  id: string;
  status: ScreeningStatus;
  decision: ScreeningDecision | null;
  requestedAt: Date;
  completedAt: Date | null;
  reportUrl: string | null;
  errorMessage: string | null;
}) {
  return {
    id: check.id,
    status: check.status,
    decision: check.decision,
    requestedAt: check.requestedAt,
    completedAt: check.completedAt,
    reportUrl: check.reportUrl,
    errorMessage: check.errorMessage,
  };
}
