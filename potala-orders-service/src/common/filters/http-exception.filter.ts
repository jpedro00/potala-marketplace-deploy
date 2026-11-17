import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction = process.env.NODE_ENV === 'production';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let operationalCode: string | undefined;
    const path = request.path ?? request.url.split('?')[0];
    const prismaCode =
      exception instanceof Prisma.PrismaClientKnownRequestError
        ? exception.code
        : undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
        error = exception.name;
      } else if (typeof payload === 'object' && payload !== null) {
        const body = payload as { message?: string | string[]; error?: string };
        message = body.message ?? exception.message;
        error = body.error ?? exception.name;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'Resource already exists';
        error = 'Conflict';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Resource not found';
        error = 'Not Found';
      } else if (['P2021', 'P2022'].includes(exception.code)) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        message = 'Serviço temporariamente indisponível.';
        error = 'Service Unavailable';
        operationalCode = 'DATABASE_SCHEMA_NOT_READY';
      } else if (
        ['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(exception.code)
      ) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        message = 'Serviço temporariamente indisponível.';
        error = 'Service Unavailable';
        operationalCode = 'DATABASE_UNAVAILABLE';
      }
    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = 'Serviço temporariamente indisponível.';
      error = 'Service Unavailable';
      operationalCode = 'DATABASE_UNAVAILABLE';
    }

    if (status >= 500) {
      this.logger.error(
        JSON.stringify({
          event: 'request_failed',
          method: request.method,
          path,
          status,
          code: operationalCode ?? 'INTERNAL_ERROR',
          ...(prismaCode ? { prismaCode } : {}),
        }),
      );
    } else {
      this.logger.warn(`${request.method} ${path} -> ${status}`);
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      path,
      ...(operationalCode ? { code: operationalCode } : {}),
      timestamp: new Date().toISOString(),
      ...(isProduction || status < 500
        ? {}
        : {
            stack:
              exception instanceof Error && !isProduction
                ? exception.stack
                : undefined,
          }),
    });
  }
}
