// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'manager' | 'maintenance';
export type UserStatus = 'active' | 'invited' | 'deactivated';

export type PlanTier = 'starter' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled';

export type PropertyType = 'multifamily' | 'single_family' | 'commercial' | 'mixed_use';

export type UnitType = 'studio' | 'one_bed' | 'two_bed' | 'three_bed' | 'four_plus_bed' | 'commercial';
export type UnitStatus = 'vacant' | 'occupied' | 'notice' | 'maintenance' | 'unlisted';

export type PortalStatus = 'invited' | 'active' | 'never_logged_in';
export type PreferredContact = 'email' | 'sms' | 'call';
export type GovernmentIdType = 'drivers_license' | 'state_id' | 'passport';
export type IncomeSource = 'employment' | 'self_employed' | 'benefits' | 'other';

export type LeaseStatus = 'draft' | 'active' | 'month_to_month' | 'notice_given' | 'expired' | 'terminated';
export type LeaseType = 'fixed_term' | 'month_to_month';
export type SecurityDepositStatus = 'held' | 'partial_return' | 'full_return' | 'applied_to_balance';
export type EsignatureStatus = 'pending' | 'partially_signed' | 'completed';

export type PaymentType = 'rent' | 'deposit' | 'late_fee' | 'pet_deposit' | 'parking' | 'credit' | 'other';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'waived' | 'refunded';
export type PaymentMethod = 'ach' | 'card' | 'check' | 'cash' | 'money_order' | 'other';

export type WorkOrderCategory =
  | 'plumbing'
  | 'electrical'
  | 'hvac'
  | 'appliance'
  | 'pest'
  | 'structural'
  | 'cosmetic'
  | 'grounds'
  | 'general'
  | 'other';

export type WorkOrderPriority = 'emergency' | 'urgent' | 'routine';

export type WorkOrderStatus =
  | 'new_order'
  | 'assigned'
  | 'in_progress'
  | 'pending_parts'
  | 'completed'
  | 'closed'
  | 'cancelled';

export type VendorStatus = 'active' | 'inactive';

export type DocumentEntityType = 'property' | 'unit' | 'lease' | 'tenant' | 'work_order' | 'vendor';
export type DocumentCategory = 'lease' | 'inspection' | 'insurance' | 'id' | 'photo' | 'other';

// ─── Entity Interfaces ────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
  timezone: string;
  dateFormat: string | null;
  planTier: PlanTier;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  lateFeeAmount: number;
  gracePeriodDays: number;
  rentDueDay: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  avatarUrl: string | null;
  invitedAt: Date | null;
  lastLoginAt: Date | null;
  notifRentOverdue: string | null;
  notifWorkOrder: string | null;
  notifLeaseExpiry: string | null;
  notifNewMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Property {
  id: string;
  organizationId: string;
  name: string;
  type: PropertyType;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  jurisdictionNotes: string | null;
  yearBuilt: number | null;
  unitCount: number;
  amenities: string[];
  photoUrl: string | null;
  notes: string | null;
  taxParcelId: string | null;
  insurancePolicyNumber: string | null;
  insuranceExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Unit {
  id: string;
  propertyId: string;
  unitNumber: string;
  floor: number | null;
  type: UnitType | null;
  bedrooms: number;
  bathrooms: number;
  sqFt: number | null;
  marketRent: number | null;
  rentAmount: number;
  depositAmount: number;
  status: UnitStatus;
  availableDate: Date | null;
  parkingSpaces: string[];
  storageUnit: string | null;
  utilityMeterElectric: string | null;
  utilityMeterGas: string | null;
  utilityMeterWater: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  lastInspectionAt: Date | null;
  lastRenovationAt: Date | null;
  applianceCount: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantVehicle {
  make: string;
  model: string;
  color: string;
  plate: string;
  state: string;
}

export interface TenantPet {
  type: string;
  breed: string;
  weight: number;
  name: string;
}

export interface Tenant {
  id: string;
  organizationId: string;
  // Identity
  email: string;
  name: string;
  fullLegalName: string | null;
  preferredName: string | null;
  dateOfBirth: Date | null;
  phone: string | null;
  phoneSecondary: string | null;
  preferredContact: PreferredContact | null;
  languagePreference: string | null;
  avatarUrl: string | null;
  // Screening
  ssnLast4: string | null;
  govtIdType: GovernmentIdType | null;
  screeningConsentAt: Date | null;
  // Address history
  currentAddress: string | null;
  previousAddress: string | null;
  // Employment & income
  employerName: string | null;
  employerPhone: string | null;
  monthlyGrossIncome: number | null;
  incomeSource: IncomeSource | null;
  // Emergency contacts
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContact1Relationship: string | null;
  emergencyContact1Email: string | null;
  emergencyContact2Name: string | null;
  emergencyContact2Phone: string | null;
  emergencyContact2Relationship: string | null;
  // Vehicles & pets
  vehicles: TenantVehicle[] | null;
  pets: TenantPet[] | null;
  // Portal
  portalStatus: PortalStatus;
  portalInvitedAt: Date | null;
  notifPaymentConfirm: string | null;
  notifWorkOrderUpdate: string | null;
  notifMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface Lease {
  id: string;
  unitId: string;
  status: LeaseStatus;
  type: LeaseType | null;
  startDate: Date;
  endDate: Date;
  moveInDate: Date | null;
  moveOutDate: Date | null;
  noticePeriodDays: number;
  rentAmount: number;
  rentDueDay: number;
  lateFeeAmount: number;
  lateFeeGraceDays: number;
  depositAmount: number;
  securityDepositPaidAt: Date | null;
  securityDepositStatus: SecurityDepositStatus;
  securityDepositReturnedAt: Date | null;
  securityDepositReturnAmount: number | null;
  securityDepositDeductions: Record<string, unknown> | null;
  utilitiesIncluded: string[];
  hasPetAddendum: boolean;
  petDepositAmount: number | null;
  hasParkingAddendum: boolean;
  parkingFee: number | null;
  occupantCount: number;
  occupantNames: string[];
  documentUrl: string | null;
  esignatureStatus: EsignatureStatus;
  tenantSignedAt: Date | null;
  managerSignedAt: Date | null;
  renewalOfLeaseId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface LeaseParticipant {
  id: string;
  leaseId: string;
  tenantId: string;
  isPrimary: boolean;
}

export interface Payment {
  id: string;
  leaseId: string;
  tenantId: string;
  amount: number;
  type: PaymentType;
  status: PaymentStatus;
  method: PaymentMethod;
  stripePaymentIntentId: string | null;
  checkNumber: string | null;
  referenceNote: string | null;
  paidAt: Date | null;
  dueDate: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  isLate: boolean;
  lateFeeApplied: boolean;
  lateFeeWaived: boolean | null;
  lateFeeWaivedReason: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface WorkOrder {
  id: string;
  unitId: string;
  propertyId: string | null;
  tenantId: string | null;
  assignedToUserId: string | null;
  submittedByUserId: string | null;
  vendorId: string | null;
  title: string | null;
  category: WorkOrderCategory;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  description: string;
  slaDeadlineAt: Date | null;
  slaBreached: boolean;
  entryPermissionGranted: boolean;
  preferredContactWindow: string | null;
  scheduledAt: Date | null;
  completedAt: Date | null;
  resolutionNotes: string | null;
  laborCost: number | null;
  partsCost: number | null;
  totalCost: number | null;
  chargedToTenant: boolean | null;
  tenantChargeAmount: number | null;
  photosBefore: string[];
  photosAfter: string[];
  videoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Vendor {
  id: string;
  organizationId: string;
  companyName: string;
  contactName: string;
  email: string;
  phonePrimary: string;
  phoneEmergency: string | null;
  specialties: string[];
  status: VendorStatus;
  preferred: boolean | null;
  rating: number | null;
  notes: string | null;
  licenseNumber: string | null;
  licenseExpiresAt: Date | null;
  insuranceOnFile: boolean;
  insuranceExpiresAt: Date | null;
  w9OnFile: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  organizationId: string;
  threadId: string | null;
  unitId: string | null;
  workOrderId: string | null;
  subject: string | null;
  senderUserId: string | null;
  recipientTenantId: string | null;
  body: string;
  attachmentUrl: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface Document {
  id: string;
  organizationId: string;
  entityType: DocumentEntityType;
  entityId: string;
  name: string;
  s3Key: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: string;
  visibleToTenant: boolean;
  docCategory: DocumentCategory | null;
  label: string | null;
  createdAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  organizationId: string;
  type: string;
  title: string;
  body: string;
  readAt: Date | null;
  actionUrl: string | null;
  createdAt: Date;
}
