import { validateMaterialFile } from './material-files';
const pdf = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF',
);
describe('Protected material validation', () => {
  it('accepts bounded PDF bytes and normalizes safe file metadata', () => {
    const r = validateMaterialFile({
      title: 'Aula',
      filename: 'aula.pdf',
      mimeType: 'application/pdf',
      base64: pdf.toString('base64'),
    });
    expect(Buffer.from(r.data).equals(pdf)).toBe(true);
    expect(r.mimeType).toBe('application/pdf');
    expect(r.sizeBytes).toBe(pdf.length);
  });
  it.each(['../secret.pdf', 'x.exe', 'x.pdf.exe', 'x".pdf', 'x\r\n.pdf'])(
    'rejects unsafe filename %s',
    (filename) => {
      expect(() =>
        validateMaterialFile({
          title: 'x',
          filename,
          mimeType: 'application/pdf',
          base64: pdf.toString('base64'),
        }),
      ).toThrow();
    },
  );
  it('rejects MIME/extension/magic mismatch and malformed base64', () => {
    for (const file of [
      {
        filename: 'x.png',
        mimeType: 'application/pdf',
        base64: pdf.toString('base64'),
      },
      {
        filename: 'x.pdf',
        mimeType: 'application/pdf',
        base64: Buffer.from('MZ executable').toString('base64'),
      },
      { filename: 'x.pdf', mimeType: 'application/pdf', base64: '!!!!' },
    ])
      expect(() => validateMaterialFile({ title: 'x', ...file })).toThrow();
  });
  it('rejects active PDF scripting and encoded dangerous names', () => {
    for (const content of [
      '%PDF-1.4 /JavaScript (alert) %%EOF',
      '%PDF-1.4 /Java#53cript (alert) %%EOF',
      '%PDF-1.4 /EmbeddedFile /Launch %%EOF',
    ])
      expect(() =>
        validateMaterialFile({
          title: 'x',
          filename: 'x.pdf',
          mimeType: 'application/pdf',
          base64: Buffer.from(content).toString('base64'),
        }),
      ).toThrow();
  });
  it('rejects files over the 5MiB limit', () => {
    expect(() =>
      validateMaterialFile({
        title: 'x',
        filename: 'x.txt',
        mimeType: 'text/plain',
        base64: Buffer.alloc(5242881, 65).toString('base64'),
      }),
    ).toThrow();
  });
  it('preserves legacy text but rejects null/executable bytes and ambiguous payloads', () => {
    expect(
      Buffer.from(validateMaterialFile({
        title: 'x',
        filename: 'x.txt',
        content: 'Texto português',
      }).data).toString(),
    ).toBe('Texto português');
    expect(() =>
      validateMaterialFile({
        title: 'x',
        filename: 'x.txt',
        mimeType: 'text/plain',
        base64: Buffer.from([0, 255]).toString('base64'),
      }),
    ).toThrow();
    expect(() =>
      validateMaterialFile({
        title: 'x',
        filename: 'x.txt',
        content: 'text',
        base64: 'dGV4dA==',
      }),
    ).toThrow();
  });
  it('accepts a PNG with valid header/end and refuses trailing executable payload', () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPioAAAAASUVORK5CYII=',
      'base64',
    );
    expect(
      validateMaterialFile({
        title: 'x',
        filename: 'x.png',
        mimeType: 'image/png',
        base64: png.toString('base64'),
      }).sizeBytes,
    ).toBe(png.length);
    expect(() =>
      validateMaterialFile({
        title: 'x',
        filename: 'x.png',
        mimeType: 'image/png',
        base64: Buffer.concat([png, Buffer.from('MZ')]).toString('base64'),
      }),
    ).toThrow();
  });
});
