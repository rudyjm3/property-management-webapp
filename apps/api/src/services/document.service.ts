import { prisma } from '@propflow/db';
import { AppError } from '../middleware/error-handler';
import {
  buildS3Key,
  generateUploadPresignedUrl,
  generateDownloadPresignedUrl,
  deleteS3Object,
} from './s3.service';
import type { z } from 'zod';
import type { requestUploadSchema, confirmUploadSchema, listDocumentsSchema } from '@propflow/shared';

type RequestUploadInput = z.infer<typeof requestUploadSchema>;
type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;
type ListDocumentsQuery = z.infer<typeof listDocumentsSchema>;

/**
 * Step 1 of a two-step upload:
 * Generate a presigned PUT URL so the browser can upload directly to S3.
 * Does NOT create a DB record yet — that happens in confirmUpload after the
 * client verifies the upload succeeded.
 */
export async function requestUpload(
  organizationId: string,
  uploadedByUserId: string,
  input: RequestUploadInput,
) {
  // Verify the caller belongs to the organization before minting a presigned URL
  const user = await prisma.user.findFirst({
    where: { id: uploadedByUserId, organizationId },
    select: { id: true },
  });
  if (!user) throw new AppError(403, 'FORBIDDEN', 'Forbidden');

  const s3Key = buildS3Key(
    organizationId,
    input.entityType,
    input.entityId,
    input.fileName,
  );

  const { uploadUrl } = await generateUploadPresignedUrl(s3Key, input.mimeType);

  return {
    uploadUrl,
    s3Key,
    expiresInSeconds: 900,
  };
}

/**
 * Step 2 of the upload flow:
 * Called by the client after a successful direct S3 upload.
 * Creates the Document metadata record in the database.
 */
export async function confirmUpload(
  organizationId: string,
  uploadedByUserId: string,
  input: ConfirmUploadInput,
) {
  // Verify the user belongs to the organization
  const user = await prisma.user.findFirst({
    where: { id: uploadedByUserId, organizationId },
    select: { id: true },
  });
  if (!user) throw new AppError(403, 'FORBIDDEN', 'Forbidden');

  const document = await prisma.document.create({
    data: {
      organizationId,
      entityType: input.entityType as any,
      entityId: input.entityId,
      name: input.fileName,
      s3Key: input.s3Key,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedByUserId,
      docCategory: (input.docCategory as any) ?? null,
      label: input.label ?? null,
      visibleToTenant: input.visibleToTenant,
    },
  });

  return document;
}

/**
 * List documents for an organization, optionally filtered by entity.
 */
export async function listDocuments(
  organizationId: string,
  query: ListDocumentsQuery,
) {
  return prisma.document.findMany({
    where: {
      organizationId,
      ...(query.entityType ? { entityType: query.entityType as any } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
    },
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get a single document's metadata (org-scoped).
 */
export async function getDocument(organizationId: string, documentId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, organizationId },
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
  });
  if (!doc) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  return doc;
}

/**
 * Generate a short-lived presigned download URL for a document.
 */
export async function getDownloadUrl(organizationId: string, documentId: string) {
  const doc = await getDocument(organizationId, documentId);
  const downloadUrl = await generateDownloadPresignedUrl(doc.s3Key);
  return { downloadUrl, document: doc };
}

/**
 * Delete a document — removes the S3 object and the DB record.
 */
export async function deleteDocument(organizationId: string, documentId: string) {
  const doc = await getDocument(organizationId, documentId);

  // Remove from S3 first; if it fails, the DB record remains (recoverable)
  await deleteS3Object(doc.s3Key);

  await prisma.document.delete({ where: { id: documentId } });
}
