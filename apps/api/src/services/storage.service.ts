import { supabaseAdmin } from '../lib/supabase';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || '';

const DOWNLOAD_EXPIRY_SECONDS = 3600;

export async function generateUploadPresignedUrl(
  key: string,
  _contentType: string,
): Promise<{ uploadUrl: string; storageKey: string }> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUploadUrl(key);

  if (error || !data) {
    throw error ?? new Error('Failed to generate upload URL');
  }

  return { uploadUrl: data.signedUrl, storageKey: key };
}

export async function generateDownloadPresignedUrl(storageKey: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storageKey, DOWNLOAD_EXPIRY_SECONDS);

  if (error || !data) {
    throw error ?? new Error('Failed to generate download URL');
  }

  return data.signedUrl;
}

export async function deleteStorageObject(storageKey: string): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .remove([storageKey]);

  if (error) throw error;
}

export function buildStorageKey(
  orgId: string,
  entityType: string,
  entityId: string,
  fileName: string,
): string {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uuid = crypto.randomUUID();
  return `org/${orgId}/${entityType}/${entityId}/${uuid}-${safeFileName}`;
}
