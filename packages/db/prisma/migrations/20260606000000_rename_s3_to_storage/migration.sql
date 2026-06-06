-- Rename S3-specific column names to storage-agnostic names.
--
-- PRE-REQUISITE for environments with existing data:
-- Before applying this migration and deploying the new code, copy all objects
-- from the S3 bucket into the Supabase Storage bucket, preserving the same
-- key paths (org/{orgId}/...). The application code will begin resolving keys
-- against Supabase Storage immediately after deployment; any key not present
-- there will produce a missing-object error.
-- New/development environments with no existing file data can apply as-is.

ALTER TABLE documents RENAME COLUMN s3_key TO storage_key;
ALTER TABLE messages RENAME COLUMN attachment_s3_key TO attachment_storage_key;
