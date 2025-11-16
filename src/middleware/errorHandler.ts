import { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'

export function errorHandler(error: Error | AppError, req: Request, res: Response, _next: NextFunction) {
  logger.error('Error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  })

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      details: error.details,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    })
  }

  if ((error as any).name === 'PrismaClientKnownRequestError') {
    return res.status(400).json({
      error: 'Database error',
      message: 'Invalid request to database',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    })
  }

  if ((error as any).name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      message: error.message
    })
  }

  return res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  })
}
