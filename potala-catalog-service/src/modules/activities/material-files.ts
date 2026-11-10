import { BadRequestException } from '@nestjs/common';
import { MaterialDto } from './activities.dto';
export const MATERIAL_MAX_BYTES = 5 * 1024 * 1024;
const extensions: Record<string, RegExp> = {
  'text/plain': /\.txt$/i,
  'application/pdf': /\.pdf$/i,
  'image/jpeg': /\.jpe?g$/i,
  'image/png': /\.png$/i,
};
export function validateMaterialFile(dto: MaterialDto) {
  const invalid = () => {
    throw new BadRequestException(
      'Arquivo inválido. Use PDF sem conteúdo ativo, PNG, JPEG ou TXT UTF-8; máximo 5 MiB.',
    );
  };
  if (!/^[a-zA-Z0-9_-]{1,80}\.(txt|pdf|jpg|jpeg|png)$/i.test(dto.filename))
    invalid();
  if (dto.base64 !== undefined && dto.content !== undefined) invalid();
  const mimeType = dto.base64 === undefined ? 'text/plain' : dto.mimeType;
  if (
    !mimeType ||
    !extensions[mimeType] ||
    !extensions[mimeType].test(dto.filename) ||
    (dto.base64 === undefined && dto.mimeType && dto.mimeType !== 'text/plain')
  )
    invalid();
  let data: Buffer;
  if (dto.base64 !== undefined) {
    if (
      dto.base64.length > 6990508 ||
      !dto.base64.length ||
      dto.base64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(dto.base64)
    )
      invalid();
    data = Buffer.from(dto.base64, 'base64');
    if (data.toString('base64') !== dto.base64) invalid();
  } else {
    if (typeof dto.content !== 'string') invalid();
    data = Buffer.from(dto.content!, 'utf8');
  }
  if (!data.length || data.length > MATERIAL_MAX_BYTES) invalid();
  if (mimeType === 'application/pdf') {
    const raw = data.toString('latin1');
    const normalized = raw.replace(/#([0-9a-f]{2})/gi, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    if (!raw.startsWith('%PDF-1.') && !raw.startsWith('%PDF-2.')) invalid();
    if (
      !/%%EOF\s*$/.test(raw) ||
      /\/(?:JS|JavaScript|OpenAction|AA|Launch|EmbeddedFile|RichMedia|XFA)\b/i.test(
        normalized,
      )
    )
      invalid();
  } else if (mimeType === 'image/png') {
    if (
      data.length < 33 ||
      data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      data.subarray(12, 16).toString() !== 'IHDR' ||
      data.subarray(-12).toString('hex') !== '0000000049454e44ae426082'
    )
      invalid();
  } else if (mimeType === 'image/jpeg') {
    if (
      data.length < 4 ||
      data[0] !== 255 ||
      data[1] !== 216 ||
      data[2] !== 255 ||
      data[data.length - 2] !== 255 ||
      data[data.length - 1] !== 217
    )
      invalid();
  } else {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text)) invalid();
    } catch {
      invalid();
    }
  }
  return {
    data: new Uint8Array(data),
    mimeType: mimeType!,
    sizeBytes: data.length,
    filename: dto.filename,
    title: dto.title,
    content: '',
  };
}
