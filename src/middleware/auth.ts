import { Request, Response, NextFunction } from 'express'
import { supabase } from '../config/supabase'
import { prisma } from '../config/database'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'

export interface AuthRequest extends Request {
  user?: any
  supabaseUser?: any
}

function getNextMonthResetDate() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 1)
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401)
    }

    const token = authHeader.substring(7)

    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      logger.warn(`Invalid token attempt: ${error?.message}`)
      throw new AppError('Invalid or expired token', 401)
    }

    const userProfile = await prisma.user.findUnique({
      where: { supabase_user_id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        company: true,
        industry: true,
        country: true,
        timezone: true,
        avatar_url: true,
        stripe_customer_id: true,
        stripe_subscription_id: true,
        supabase_user_id: true,
        subscription_status: true,
        current_period_end: true,
        messages_used_this_month: true,
        messages_reset_date: true,
        created_at: true,
        last_login: true
      }
    })

    if (!userProfile) {
      const newUser = await prisma.user.create({
        data: {
          supabase_user_id: user.id,
          email: user.email!,
          name: user.user_metadata?.name || null,
          avatar_url: user.user_metadata?.avatar_url || null,
          messages_reset_date: getNextMonthResetDate()
        }
      })
      req.user = newUser
    } else {
      req.user = userProfile
    }

    req.supabaseUser = user

    await prisma.user.update({
      where: { id: req.user.id },
      data: { last_login: new Date() }
    }).catch(err => logger.error('Failed to update last_login:', err))

    next()
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code
      })
    }

    logger.error('Authentication error:', error)
    res.status(500).json({ error: 'Authentication failed' })
  }
}

export async function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization

    if (authHeader && authHeader.startsWith('Bearer ')) {
      await authenticate(req, res, next)
    } else {
      next()
    }
  } catch (error) {
    next()
  }
}
