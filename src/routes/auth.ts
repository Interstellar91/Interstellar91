import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { prisma } from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'

const router = Router()

function getNextMonthResetDate() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 1)
}

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name, company, industry } = req.body

    if (!email || !password) {
      throw new AppError('Email and password are required', 400)
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        company,
        industry
      }
    })

    if (authError || !authData.user) {
      throw new AppError(authError?.message || 'Registration failed', 400)
    }

    const user = await prisma.user.create({
      data: {
        supabase_user_id: authData.user.id,
        email,
        name,
        company,
        industry,
        messages_reset_date: getNextMonthResetDate()
      }
    })

    logger.info(`New user registered: ${email}`)

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tier: user.tier
      }
    })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    logger.error('Registration error:', error)
    res.status(500).json({ error: 'Registration failed' })
  }
})

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  res.json({ user: req.user })
})

router.patch('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, company, industry, country, timezone } = req.body

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name,
        company,
        industry,
        country,
        timezone
      }
    })

    res.json({ user: updatedUser })
  } catch (error) {
    logger.error('Update profile error:', error)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body

    if (!email) {
      throw new AppError('Email is required', 400)
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL}/auth/reset-password`
    })

    if (error) {
      throw new AppError(error.message, 400)
    }

    res.json({ message: 'Password reset email sent' })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    res.status(500).json({ error: 'Failed to send reset email' })
  }
})

export default router
