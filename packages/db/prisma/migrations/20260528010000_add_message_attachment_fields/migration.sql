-- Add structured attachment tracking fields to messages.
-- attachmentUrl (legacy nullable string) is kept in place; new fields
-- carry the S3 key, display name, and MIME type needed to generate
-- download presigned URLs on the fly.
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "attachment_s3_key"   VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS "attachment_name"      VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "attachment_mime_type" VARCHAR(100);
