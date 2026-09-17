-- Module gating: track which add-on modules an org has active.
-- No billing wiring yet — see packages/shared/src/constants/modules.ts.
ALTER TABLE "organizations" ADD COLUMN     "active_modules" TEXT[] DEFAULT ARRAY[]::TEXT[];
