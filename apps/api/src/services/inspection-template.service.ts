import { prisma, Prisma } from '@propflow/db';
import { DEFAULT_INSPECTION_CHECKLIST } from '@propflow/shared';
import { AppError } from '../middleware/error-handler';

// Inspections & Compliance (Module 6) — configurable checklist templates.
// v1 is "real stored data with basic CRUD, one seeded default template" —
// NOT a full property-type-aware template picker. See docs/reference/modules.md.

interface ChecklistItemInput {
  section: string;
  item: string;
  description?: string | null;
}

interface TemplateInput {
  name: string;
  description?: string | null;
  checklistItems: ChecklistItemInput[];
  isDefault?: boolean;
}

export async function listTemplates(organizationId: string) {
  return prisma.inspectionTemplate.findMany({
    where: { organizationId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function getTemplate(organizationId: string, templateId: string) {
  const template = await prisma.inspectionTemplate.findFirst({
    where: { id: templateId, organizationId },
  });
  if (!template) {
    throw new AppError(404, 'INSPECTION_TEMPLATE_NOT_FOUND', 'Inspection template not found.');
  }
  return template;
}

// Ensures every org has at least one usable template — lazily seeds the
// default checklist the first time an org's templates are listed/used if
// none exists yet (covers orgs created before this module's seed ran).
export async function ensureDefaultTemplate(organizationId: string) {
  const existing = await prisma.inspectionTemplate.findFirst({
    where: { organizationId, isDefault: true },
  });
  if (existing) return existing;

  return prisma.inspectionTemplate.create({
    data: {
      organizationId,
      name: 'General Move-In / Move-Out Checklist',
      description: 'Default checklist covering kitchen, bathrooms, bedrooms, living areas, exterior, appliances, and safety devices.',
      checklistItems: DEFAULT_INSPECTION_CHECKLIST as unknown as Prisma.InputJsonValue,
      isDefault: true,
    },
  });
}

async function unsetOtherDefaults(organizationId: string, exceptId?: string) {
  await prisma.inspectionTemplate.updateMany({
    where: { organizationId, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
    data: { isDefault: false },
  });
}

export async function createTemplate(organizationId: string, data: TemplateInput) {
  if (data.isDefault) {
    await unsetOtherDefaults(organizationId);
  }
  return prisma.inspectionTemplate.create({
    data: {
      organizationId,
      name: data.name,
      description: data.description ?? null,
      checklistItems: data.checklistItems as unknown as Prisma.InputJsonValue,
      isDefault: data.isDefault ?? false,
    },
  });
}

export async function updateTemplate(
  organizationId: string,
  templateId: string,
  data: Partial<TemplateInput>
) {
  await getTemplate(organizationId, templateId);

  if (data.isDefault) {
    await unsetOtherDefaults(organizationId, templateId);
  }

  return prisma.inspectionTemplate.update({
    where: { id: templateId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.checklistItems !== undefined && { checklistItems: data.checklistItems as unknown as Prisma.InputJsonValue }),
      ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
    },
  });
}

export async function deleteTemplate(organizationId: string, templateId: string) {
  await getTemplate(organizationId, templateId);
  await prisma.inspectionTemplate.delete({ where: { id: templateId } });
}
