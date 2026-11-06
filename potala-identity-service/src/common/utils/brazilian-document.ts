import { DocumentType } from '../types/document-type';

export function normalizeDocument(documentNumber: string): string {
  return documentNumber.replace(/\D/g, '');
}

export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) {
    return false;
  }
  if (/^(\d)\1{10}$/.test(digits)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(digits[i]) * (10 - i);
  }
  let first = (sum * 10) % 11;
  if (first === 10) {
    first = 0;
  }
  if (first !== Number(digits[9])) {
    return false;
  }

  sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(digits[i]) * (11 - i);
  }
  let second = (sum * 10) % 11;
  if (second === 10) {
    second = 0;
  }
  return second === Number(digits[10]);
}

export function isValidCnpj(digits: string): boolean {
  if (!/^\d{14}$/.test(digits)) {
    return false;
  }
  if (/^(\d)\1{13}$/.test(digits)) {
    return false;
  }

  const verifier = (base: string, weights: number[]): number => {
    const sum = base
      .split('')
      .reduce(
        (total, digit, index) => total + Number(digit) * weights[index]!,
        0,
      );
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const first = verifier(digits.slice(0, 12), firstWeights);
  const second = verifier(digits.slice(0, 12) + String(first), secondWeights);

  return first === Number(digits[12]) && second === Number(digits[13]);
}

export function parseBrazilianDocument(
  documentType: DocumentType,
  raw: string,
): { ok: true; digits: string } | { ok: false; message: string } {
  const digits = normalizeDocument(raw);

  if (documentType === DocumentType.CPF) {
    if (digits.length !== 11) {
      return { ok: false, message: 'CPF must contain exactly 11 digits' };
    }
    if (!isValidCpf(digits)) {
      return { ok: false, message: 'Invalid CPF check digits' };
    }
    return { ok: true, digits };
  }

  if (digits.length !== 14) {
    return { ok: false, message: 'CNPJ must contain exactly 14 digits' };
  }
  if (!isValidCnpj(digits)) {
    return { ok: false, message: 'Invalid CNPJ check digits' };
  }
  return { ok: true, digits };
}
