/**
 * Format a stored phone string for display as (123) 456-7890.
 * Returns '--' for null/empty, or the raw value if it's not 10 digits.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '--';
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) return phone;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Format a phone input value progressively as the user types.
 * Strips non-digits and applies (XXX) XXX-XXXX masking up to 10 digits.
 */
export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
