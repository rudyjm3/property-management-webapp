'use client';

import { useState } from 'react';
import { formatPhoneInput } from '@/lib/phone';

interface PhoneInputProps {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  required?: boolean;
}

export default function PhoneInput({ name, defaultValue, placeholder = '(555) 123-4567', required }: PhoneInputProps) {
  const [value, setValue] = useState(() => formatPhoneInput(defaultValue || ''));

  return (
    <input
      type="tel"
      name={name}
      value={value}
      placeholder={placeholder}
      required={required}
      onChange={(e) => setValue(formatPhoneInput(e.target.value))}
    />
  );
}
