import { ArgumentsHost, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GlobalExceptionFilter } from './http-exception.filter';

describe('Safe database failure responses', () => {
  const oldEnvironment = process.env.NODE_ENV;
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });
  afterEach(() => {
    if (oldEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnvironment;
    jest.restoreAllMocks();
  });
  function run(exception: unknown) {
    const response = { status: jest.fn(), json: jest.fn() };
    response.status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({
          method: 'GET',
          url: '/api/v1/activities?token=private-query',
          path: '/api/v1/activities',
        }),
      }),
    } as unknown as ArgumentsHost;
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    new GlobalExceptionFilter().catch(exception, host);
    return { response, error };
  }
  it.each(['P2021', 'P2022'])(
    'reports missing database structure %s as an actionable safe 503',
    (code) => {
      const exception = new Prisma.PrismaClientKnownRequestError(
        'private-password private-email@example.test',
        { code, clientVersion: '6', meta: { table: 'private-table' } },
      );
      const { response, error } = run(exception);
      expect(response.status).toHaveBeenCalledWith(503);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'DATABASE_SCHEMA_NOT_READY',
          message: 'Serviço temporariamente indisponível.',
          path: '/api/v1/activities',
        }),
      );
      const output = JSON.stringify([
        error.mock.calls,
        response.json.mock.calls,
      ]);
      for (const secret of [
        'private-password',
        'private-email',
        'private-query',
        'private-table',
      ])
        expect(output).not.toContain(secret);
      expect(output).toContain(code);
    },
  );
  it('reports pool exhaustion without inventing a missing migration', () => {
    const { response } = run(
      new Prisma.PrismaClientKnownRequestError('private database URL', {
        code: 'P2024',
        clientVersion: '6',
      }),
    );
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DATABASE_UNAVAILABLE' }),
    );
  });
  it.each([
    ['P2002', 409],
    ['P2025', 404],
  ])('preserves %s status semantics', (code, status) => {
    const { response } = run(
      new Prisma.PrismaClientKnownRequestError('private', {
        code: String(code),
        clientVersion: '6',
      }),
    );
    expect(response.status).toHaveBeenCalledWith(status);
  });
  it('does not log raw exceptions or query secrets for unexpected production failures', () => {
    const { response, error } = run(
      new Error('postgresql://user:private-password@host/database'),
    );
    expect(response.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(error.mock.calls)).not.toContain('private-password');
    expect(JSON.stringify(error.mock.calls)).not.toContain('private-query');
  });
});
