import { Request, Response } from 'express';
import { blockInternalPaths } from './block-internal.middleware';

function createResponse() {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
}

describe('blockInternalPaths', () => {
  it('blocks a path containing /internal/', () => {
    const req = { path: '/api/v1/internal/sellers', method: 'POST', originalUrl: '/api/v1/internal/sellers' } as Request;
    const res = createResponse();
    const next = jest.fn();

    blockInternalPaths(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a normal path through', () => {
    const req = { path: '/api/v1/auth/login', method: 'POST', originalUrl: '/api/v1/auth/login' } as Request;
    const res = createResponse();
    const next = jest.fn();

    blockInternalPaths(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('does not false-positive on a path that merely contains "internal" as a substring of another word', () => {
    const req = { path: '/api/v1/international-shipping', method: 'GET', originalUrl: '/api/v1/international-shipping' } as Request;
    const res = createResponse();
    const next = jest.fn();

    blockInternalPaths(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
