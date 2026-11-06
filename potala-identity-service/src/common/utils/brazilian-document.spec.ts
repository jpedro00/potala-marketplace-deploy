import { DocumentType } from '../types/document-type';
import {
  isValidCnpj,
  isValidCpf,
  normalizeDocument,
  parseBrazilianDocument,
} from './brazilian-document';

import {
  VALID_CNPJ,
  VALID_CNPJ_FORMATTED,
  VALID_CPF,
  VALID_CPF_FORMATTED,
} from '../../test-utils/documents';

describe('Brazilian document utilities', () => {
  it('normalizes CPF formatting', () => {
    expect(normalizeDocument(VALID_CPF_FORMATTED)).toBe(VALID_CPF);
  });

  it('normalizes CNPJ formatting', () => {
    expect(normalizeDocument(VALID_CNPJ_FORMATTED)).toBe(VALID_CNPJ);
  });

  it('accepts a valid CPF including check digits', () => {
    expect(isValidCpf(VALID_CPF)).toBe(true);
    expect(
      parseBrazilianDocument(DocumentType.CPF, VALID_CPF_FORMATTED),
    ).toEqual({
      ok: true,
      digits: VALID_CPF,
    });
  });

  it('accepts a valid CNPJ including check digits', () => {
    expect(isValidCnpj(VALID_CNPJ)).toBe(true);
    expect(
      parseBrazilianDocument(DocumentType.CNPJ, VALID_CNPJ_FORMATTED),
    ).toEqual({
      ok: true,
      digits: VALID_CNPJ,
    });
  });

  it('rejects an invalid CPF', () => {
    expect(isValidCpf('12345678901')).toBe(false);
    expect(parseBrazilianDocument(DocumentType.CPF, '123.456.789-01').ok).toBe(
      false,
    );
  });

  it('rejects repeated CPF digits', () => {
    expect(isValidCpf('11111111111')).toBe(false);
  });

  it('rejects an invalid CNPJ', () => {
    expect(isValidCnpj('12345678000190')).toBe(false);
    expect(
      parseBrazilianDocument(DocumentType.CNPJ, '12.345.678/0001-90').ok,
    ).toBe(false);
  });

  it('rejects CPF/CNPJ with the wrong length after normalization', () => {
    expect(parseBrazilianDocument(DocumentType.CPF, '123').ok).toBe(false);
    expect(parseBrazilianDocument(DocumentType.CNPJ, '123').ok).toBe(false);
  });
});
