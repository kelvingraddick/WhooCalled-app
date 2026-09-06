export function digitsOnly(value: string): string {
  const digits = value.replace(/\D/g, '');
  const nationalNumber =
    digits.length > 10 && digits.startsWith('1') ? digits.slice(1) : digits;

  return nationalNumber.slice(0, 10);
}

export function formatUsPhoneInput(value: string): string {
  const digits = digitsOnly(value);

  if (!digits) {
    return '';
  }

  if (digits.length <= 3) {
    return `(${digits}`;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function isValidUsPhoneInput(value: string): boolean {
  return digitsOnly(value).length === 10;
}
