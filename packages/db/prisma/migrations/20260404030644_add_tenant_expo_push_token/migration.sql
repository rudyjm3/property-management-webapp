-- AlterTable: add Expo push token to tenants for mobile push notifications
ALTER TABLE "tenants" ADD COLUMN "expo_push_token" VARCHAR(200);
