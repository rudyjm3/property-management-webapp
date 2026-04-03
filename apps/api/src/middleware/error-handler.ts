import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@propflow/db';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  // Prisma known errors (constraint violations, missing records, etc.)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: { code: 'CONFLICT', message: 'A record with this value already exists.' },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Record not found.' },
      });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        error: { code: 'INVALID_RELATION', message: 'Related record not found.' },
      });
      return;
    }
    console.error('Prisma error:', err.code, err.message, err.meta);
    res.status(400).json({
      error: { code: `DB_${err.code}`, message: err.message },
    });
    return;
  }

  // Prisma validation errors (wrong types, missing required fields)
  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error('Prisma validation error:', err.message);
    res.status(400).json({
      error: { code: 'DB_VALIDATION', message: 'Invalid data sent to database.' },
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}
