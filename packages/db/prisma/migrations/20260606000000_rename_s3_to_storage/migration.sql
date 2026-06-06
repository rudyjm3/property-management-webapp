-- Rename S3-specific column names to storage-agnostic names

ALTER TABLE documents RENAME COLUMN s3_key TO storage_key;
ALTER TABLE messages RENAME COLUMN attachment_s3_key TO attachment_storage_key;
