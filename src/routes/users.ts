import { Router, Response } from 'express'
import { prisma } from '../config/database'
import { supabase } from '../config/supabase'
import { authenticate, AuthRequest } from '../middleware/auth'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'

const router = Router()

router.patch('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, company, industry, country, timezone, avatar_url } = req.body

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name,
        company,
        industry,
        country,
        timezone,
        avatar_url
      }
    })

    logger.info(`Profile updated for user ${req.user.id}`)

    res.json({ user: updatedUser })
  } catch (error) {
    logger.error('Update profile error:', error)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { current_password, new_password } = req.body

    if (!current_password || !new_password) {
      throw new AppError('Current and new password are required', 400)
    }

    if (new_password.length < 8) {
      throw new AppError('New password must be at least 8 characters', 400)
    }

    throw new AppError('Password change must be done through the client', 400)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    logger.error('Change password error:', error)
    res.status(500).json({ error: 'Failed to change password' })
  }
})

router.delete('/account', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { confirm } = req.body

    if (confirm !== 'DELETE') {
      throw new AppError('Please confirm account deletion by sending { "confirm": "DELETE" }', 400)
    }

    await prisma.$transaction([
      prisma.message.deleteMany({
        where: {
          conversation: {
            user_id: req.user.id
          }
        }
      }),
      prisma.conversation.deleteMany({
        where: { user_id: req.user.id }
      }),
      prisma.campaign.deleteMany({
        where: { user_id: req.user.id }
      }),
      prisma.report.deleteMany({
        where: { user_id: req.user.id }
      }),
      prisma.usageLog.deleteMany({
        where: { user_id: req.user.id }
      }),
      prisma.user.delete({
        where: { id: req.user.id }
      })
    ])

    if (req.user.supabase_user_id) {
      await supabase.auth.admin.deleteUser(req.user.supabase_user_id)
    }

    logger.info(`Account deleted for user ${req.user.id}`)

    res.json({ message: 'Account deleted successfully' })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    logger.error('Delete account error:', error)
    res.status(500).json({ error: 'Failed to delete account' })
  }
})

router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const stats = {
      account: {
        email: req.user.email,
        name: req.user.name,
        tier: req.user.tier,
        member_since: req.user.created_at,
        last_login: req.user.last_login
      },
      usage: {
        total_conversations: await prisma.conversation.count({
          where: { user_id: req.user.id }
        }),
        total_messages: await prisma.message.count({
          where: {
            conversation: {
              user_id: req.user.id
            }
          }
        }),
        messages_this_month: req.user.messages_used_this_month,
        total_campaigns: await prisma.campaign.count({
          where: { user_id: req.user.id }
        }),
        total_reports: await prisma.report.count({
          where: { user_id: req.user.id }
        })
      },
      subscription: {
        tier: req.user.tier,
        status: req.user.subscription_status,
        current_period_end: req.user.current_period_end
      }
    }

    res.json({ stats })
  } catch (error) {
    logger.error('Get stats error:', error)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

export default router
