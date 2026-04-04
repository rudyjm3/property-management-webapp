import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propflow/db', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    payment: {
      findMany: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../src/services/s3.service', () => ({
  generateDownloadPresignedUrl: vi.fn(),
  buildS3Key: vi.fn(),
  generateUploadPresignedUrl: vi.fn(),
}));

import { prisma } from '@propflow/db';
import * as s3Service from '../src/services/s3.service';
import {
  getTenantDocuments,
  getTenantDocumentDownloadUrl,
  getTenantPayments,
  updateTenantProfile,
} from '../src/services/tenant-portal.service';

const mockTenantProfile = {
  id: 'tenant-1',
  email: 'tenant@example.com',
  name: 'Test Tenant',
  phone: '555-111-2222',
  avatarUrl: null,
  preferredContact: 'sms',
  languagePreference: 'en',
  emergencyContactName: 'EC One',
  emergencyContactPhone: '555-999-0000',
  emergencyContact1Relationship: 'Sibling',
  emergencyContact1Email: 'ec1@example.com',
  emergencyContact2Name: 'EC Two',
  emergencyContact2Phone: '555-333-4444',
  emergencyContact2Relationship: 'Parent',
  portalStatus: 'active',
  organizationId: 'org-1',
  organization: { id: 'org-1', name: 'PropFlow Mgmt', phone: '555-222-3333' },
  leaseParticipants: [
    {
      lease: {
        id: 'lease-1',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        rentAmount: 1500,
        unit: {
          id: 'unit-1',
          unitNumber: '2A',
          property: { id: 'property-1', name: 'Maple', address: '1 Main St' },
        },
      },
    },
  ],
};

describe('tenant-portal.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.tenant.findUnique as any).mockResolvedValue(mockTenantProfile);
    (prisma.tenant.update as any).mockResolvedValue({ id: 'tenant-1' });
    (prisma.tenant.findFirst as any).mockResolvedValue({
      id: 'tenant-1',
      organizationId: 'org-1',
      leaseParticipants: [{ leaseId: 'lease-1' }],
    });
  });

  it('updates allowed profile and emergency contact fields', async () => {
    const result = await updateTenantProfile('tenant-1', {
      phone: '555-1212',
      preferredContact: 'call',
      emergencyContactName: 'Updated Contact',
      emergencyContactPhone: '555-8989',
      emergencyContact1Email: 'updated@example.com',
    });

    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-1' },
        data: expect.objectContaining({
          phone: '555-1212',
          preferredContact: 'call',
          emergencyContactName: 'Updated Contact',
          emergencyContactPhone: '555-8989',
          emergencyContact1Email: 'updated@example.com',
        }),
      })
    );
    expect(result.id).toBe('tenant-1');
  });

  it('returns payment history with amount normalization and metadata fields', async () => {
    (prisma.payment.findMany as any).mockResolvedValue([
      {
        id: 'payment-1',
        amount: { toString: () => '1200.50', valueOf: () => 1200.5 },
        type: 'rent',
        status: 'completed',
        method: 'ach',
        referenceNote: 'March rent',
        notes: 'Paid in full',
        dueDate: new Date('2026-03-01'),
        paidAt: new Date('2026-03-01'),
        createdAt: new Date('2026-03-01T10:00:00.000Z'),
      },
    ]);

    const result = await getTenantPayments('tenant-1', {});

    expect(result.data[0]).toMatchObject({
      amount: 1200.5,
      referenceNote: 'March rent',
      notes: 'Paid in full',
    });
  });

  it('lists only tenant-scoped visible documents', async () => {
    (prisma.document.findMany as any).mockResolvedValue([
      {
        id: 'doc-1',
        name: 'Lease.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        docCategory: 'lease',
        label: 'Signed Lease',
        createdAt: new Date('2026-04-01'),
      },
    ]);

    const result = await getTenantDocuments('tenant-1');

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          visibleToTenant: true,
        }),
      })
    );
    expect(result).toHaveLength(1);
  });

  it('returns download URL for scoped document', async () => {
    (prisma.document.findFirst as any).mockResolvedValue({ s3Key: 'org/org-1/lease/lease-1/file.pdf' });
    (s3Service.generateDownloadPresignedUrl as any).mockResolvedValue('https://example.com/download');

    const result = await getTenantDocumentDownloadUrl('tenant-1', 'doc-1');

    expect(result.downloadUrl).toBe('https://example.com/download');
  });

  it('throws when tenant cannot access requested document', async () => {
    (prisma.document.findFirst as any).mockResolvedValue(null);

    await expect(getTenantDocumentDownloadUrl('tenant-1', 'doc-outside-scope')).rejects.toMatchObject({
      statusCode: 404,
      code: 'DOCUMENT_NOT_FOUND',
    });
  });
});
