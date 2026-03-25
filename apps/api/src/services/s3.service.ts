import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET = process.env.S3_BUCKET_NAME || '';

// Presigned URL valid for 15 minutes (upload window)
const UPLOAD_EXPIRY_SECONDS = 900;
// Presigned download URL valid for 1 hour
const DOWNLOAD_EXPIRY_SECONDS = 3600;

/**
 * Generate a presigned PUT URL so the client can upload directly to S3.
 * Returns the URL and the S3 key.
 */
export async function generateUploadPresignedUrl(
  key: string,
  contentType: string,
): Promise<{ uploadUrl: string; s3Key: string }> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: UPLOAD_EXPIRY_SECONDS,
  });

  return { uploadUrl, s3Key: key };
}

/**
 * Generate a presigned GET URL so authenticated users can download a file.
 */
export async function generateDownloadPresignedUrl(s3Key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
  });

  return getSignedUrl(s3Client, command, { expiresIn: DOWNLOAD_EXPIRY_SECONDS });
}

/**
 * Permanently delete an object from S3.
 */
export async function deleteS3Object(s3Key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
  });

  await s3Client.send(command);
}

/**
 * Build a scoped S3 key: org/{orgId}/{entityType}/{entityId}/{uuid}-{fileName}
 */
export function buildS3Key(
  orgId: string,
  entityType: string,
  entityId: string,
  fileName: string,
): string {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uuid = crypto.randomUUID();
  return `org/${orgId}/${entityType}/${entityId}/${uuid}-${safeFileName}`;
}
