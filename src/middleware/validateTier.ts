import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth'
import { prisma } from '../config/database'
import { AppError } from '../utils/errors'

export const TIER_LIMITS = {
  FREE: {
    messages_per_month: 50,
    conversations: 10,
    reports_per_month: 0,
    api_access: false,
    team_members: 1
  },
  PREMIUM: {
    messages_per_month: -1,
    conversations: -1,
    reports_per_month: 10,
    api_access: false,
    team_members: 1
  },
  PRO: {
    messages_per_month: -1,
    conversations: -1,
    reports_per_month: -1,
    api_access: true,
    team_members: 5
  },
  ENTERPRISE: {
    messages_per_month: -1,
    conversations: -1,
    reports_per_month: -1,
    api_access: true,
    team_members: -1
  }
}

type TierKey = keyof typeof TIER_LIMITS

export function validateTier(minTier: TierKey) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userTier = req.user.tier
      const tiers: TierKey[] = ['FREE', 'PREMIUM', 'PRO', 'ENTERPRISE']
      const userTierIndex = tiers.indexOf(userTier)
      const requiredTierIndex = tiers.indexOf(minTier)

      if (userTierIndex < requiredTierIndex) {
        throw new AppError(
          `This feature requires ${minTier} tier or higher`,
          403,
          'UPGRADE_REQUIRED',
          {
            current_tier: userTier,
            required_tier: minTier
          }
        )
      }

      next()
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
          details: error.details
        })
      }
      res.status(500).json({ error: 'Tier validation failed' })
    }
  }
}

export async function checkMessageLimit(userId: string, tier: string): Promise<boolean> {
  const limits = TIER_LIMITS[tier as TierKey]

  if (limits.messages_per_month === -1) {
    return true
  }

  const user = await prisma.user.findUnique({
    where: { id: userId }
  })

  if (!user) {
    return false
  }

  const now = new Date()
  if (user.messages_reset_date && now > user.messages_reset_date) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        messages_used_this_month: 0,
        messages_reset_date: new Date(now.getFullYear(), now.getMonth() + 1, 1)
      }
    })
    return true
  }

  return user.messages_used_this_month < limits.messages_per_month
}

export async function incrementMessageCount(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      messages_used_this_month: { increment: 1 }
    }
  })
}

export async function checkConversationLimit(userId: string, tier: string): Promise<boolean> {
  const limits = TIER_LIMITS[tier as TierKey]

  if (limits.conversations === -1) {
    return true
  }

  const count = await prisma.conversation.count({
    where: { user_id: userId }
  })

  return count < limits.conversations
}
