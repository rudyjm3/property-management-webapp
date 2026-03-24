/**
 * Unit tests for the document service and S3 helper.
 *
 * External calls (Prisma + AWS SDK) are mocked so tests run without
 * a live database or S3 bucket.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock @propflow/db ────────────────────────────────────────────────────────
// vi.mock is hoisted — factories must NOT reference variables defined below them.

vi.mock('@propflow/db', () => ({
  prisma: {
    user: { findFirst: vi.fn() },
    document: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// ─── Mock AWS SDK ─────────────────────────────────────────────────────────────

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: function S3Client() {
    return { send: vi.fn().mockResolvedValue({}) };
  },
  PutObjectCommand: function PutObjectCommand(input: any) { return input; },
  GetObjectCommand: function GetObjectCommand(input: any) { return input; },
  DeleteObjectCommand: function DeleteObjectCommand(input: any) { return input; },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import * as s3Service from '../src/services/s3.service';
import * as documentService from '../src/services/document.service';
import { prisma } from '@propflow/db';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUser = { id: 'user-1' };

const mockDocument = {
  id: 'doc-1',
  organizationId: 'org-1',
  entityType: 'property',
  entityId: 'prop-1',
  name: 'lease.pdf',
  s3Key: 'org/org-1/property/prop-1/uuid-lease.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 12345,
  uploadedByUserId: 'user-1',
  visibleToTenant: false,
  docCategory: 'lease',
  label: 'Signed Lease',
  createdAt: new Date('2024-01-01'),
  uploadedBy: { id: 'user-1', name: 'Alice Manager' },
};

// ─── s3.service tests ─────────────────────────────────────────────────────────

describe('s3.service', () => {
  describe('buildS3Key', () => {
    it('produces a scoped key with org/entity structure', () => {
      const key = s3Service.buildS3Key('org-1', 'property', 'prop-1', 'file.pdf');
      expect(key).toMatch(/^org\/org-1\/property\/prop-1\/.+-file\.pdf$/);
    });

    it('sanitises unsafe characters in the file name', () => {
      const key = s3Service.buildS3Key('org-1', 'lease', 'lease-1', 'my file (2024).pdf');
      expect(key).not.toContain(' ');
      expect(key).not.toContain('(');
      expect(key).not.toContain(')');
    });
  });

  describe('generateUploadPresignedUrl', () => {
    it('returns an uploadUrl and the s3Key', async () => {
      const { uploadUrl, s3Key } = await s3Service.generateUploadPresignedUrl(
        'org/org-1/property/prop-1/uuid-file.pdf',
        'application/pdf',
      );
      expect(uploadUrl).toBe('https://s3.example.com/presigned-url');
      expect(s3Key).toBe('org/org-1/property/prop-1/uuid-file.pdf');
    });
  });

  describe('generateDownloadPresignedUrl', () => {
    it('returns a presigned GET URL', async () => {
      const url = await s3Service.generateDownloadPresignedUrl('some/key.pdf');
      expect(url).toBe('https://s3.example.com/presigned-url');
    });
  });
});

// ─── document.service tests ───────────────────────────────────────────────────

describe('document.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    (prisma.document.create as any).mockResolvedValue(mockDocument);
    (prisma.document.findMany as any).mockResolvedValue([mockDocument]);
    (prisma.document.findFirst as any).mockResolvedValue(mockDocument);
    (prisma.document.delete as any).mockResolvedValue(mockDocument);
  });

  describe('requestUpload', () => {
    it('returns uploadUrl, s3Key, and expiry without writing to the DB', async () => {
      const result = await documentService.requestUpload('org-1', 'user-1', {
        entityType: 'property',
        entityId: 'prop-1',
        fileName: 'lease.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12345,
        visibleToTenant: false,
      });

      expect(result.uploadUrl).toBe('https://s3.example.com/presigned-url');
      expect(result.s3Key).toMatch(/^org\/org-1\/property\/prop-1\//);
      expect(result.expiresInSeconds).toBe(900);
      expect(prisma.document.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmUpload', () => {
    it('creates a Document record in the database', async () => {
      const doc = await documentService.confirmUpload('org-1', 'user-1', {
        s3Key: 'org/org-1/property/prop-1/uuid-lease.pdf',
        entityType: 'property',
        entityId: 'prop-1',
        fileName: 'lease.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12345,
        docCategory: 'lease',
        label: 'Signed Lease',
        visibleToTenant: false,
      });

      expect(prisma.document.create).toHaveBeenCalledTimes(1);
      expect(doc.id).toBe('doc-1');
      expect(doc.name).toBe('lease.pdf');
    });

    it('throws 403 if user does not belong to the organization', async () => {
      (prisma.user.findFirst as any).mockResolvedValue(null);

      await expect(
        documentService.confirmUpload('org-1', 'unknown-user', {
          s3Key: 'key',
          entityType: 'property',
          entityId: 'prop-1',
          fileName: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          visibleToTenant: false,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('listDocuments', () => {
    it('returns documents scoped to the organization', async () => {
      const docs = await documentService.listDocuments('org-1', {
        entityType: 'property',
        entityId: 'prop-1',
      });

      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-1' }),
        }),
      );
      expect(docs).toHaveLength(1);
      expect(docs[0].id).toBe('doc-1');
    });
  });

  describe('getDownloadUrl', () => {
    it('returns a presigned download URL and the document', async () => {
      const result = await documentService.getDownloadUrl('org-1', 'doc-1');
      expect(result.downloadUrl).toBe('https://s3.example.com/presigned-url');
      expect(result.document.id).toBe('doc-1');
    });

    it('throws 404 if the document does not exist', async () => {
      (prisma.document.findFirst as any).mockResolvedValue(null);

      await expect(
        documentService.getDownloadUrl('org-1', 'nonexistent'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('deleteDocument', () => {
    it('removes the DB record after deleting from S3', async () => {
      await documentService.deleteDocument('org-1', 'doc-1');
      expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
    });

    it('throws 404 if document not found', async () => {
      (prisma.document.findFirst as any).mockResolvedValue(null);

      await expect(
        documentService.deleteDocument('org-1', 'ghost'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
