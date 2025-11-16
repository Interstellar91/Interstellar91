import { Router, Response } from 'express'
import { prisma } from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { logger } from '../utils/logger'

const router = Router()

router.get('/dashboard', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    const totalConversations = await prisma.conversation.count({
      where: { user_id: userId }
    })

    const totalMessages = await prisma.message.count({
      where: {
        conversation: {
          user_id: userId
        }
      }
    })

    const messagesThisMonth = await prisma.message.count({
      where: {
        conversation: {
          user_id: userId
        },
        created_at: {
          gte: startOfMonth
        }
      }
    })

    const messagesLastMonth = await prisma.message.count({
      where: {
        conversation: {
          user_id: userId
        },
        created_at: {
          gte: startOfLastMonth,
          lt: startOfMonth
        }
      }
    })

    const tokensData = await prisma.conversation.aggregate({
      where: { user_id: userId },
      _sum: {
        tokens_used: true
      }
    })

    const usageLogs = await prisma.usageLog.findMany({
      where: {
        user_id: userId,
        created_at: {
          gte: startOfMonth
        }
      },
      orderBy: {
        created_at: 'asc'
      }
    })

    const last30Days = new Date()
    last30Days.setDate(last30Days.getDate() - 30)

    const messagesByDayRaw = await prisma.$queryRaw<{
      date: Date
      count: bigint
    }[]>`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM "Message"
      WHERE conversation_id IN (
        SELECT id FROM "Conversation" WHERE user_id = ${userId}
      )
      AND created_at >= ${last30Days}
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `

    const tokensByDayRaw = await prisma.$queryRaw<{
      date: Date
      total_tokens: bigint
    }[]>`
      SELECT 
        DATE(created_at) as date,
        SUM(tokens) as total_tokens
      FROM "Message"
      WHERE conversation_id IN (
        SELECT id FROM "Conversation" WHERE user_id = ${userId}
      )
      AND created_at >= ${last30Days}
      AND tokens IS NOT NULL
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `

    const topConversations = await prisma.conversation.findMany({
      where: { user_id: userId },
      orderBy: {
        total_messages: 'desc'
      },
      take: 5,
      select: {
        id: true,
        title: true,
        total_messages: true,
        tokens_used: true,
        created_at: true
      }
    })

    const growthRate = messagesLastMonth > 0
      ? ((Number(messagesThisMonth) - Number(messagesLastMonth)) / Number(messagesLastMonth) * 100).toFixed(1)
      : messagesThisMonth > 0 ? '100' : '0'

    const estimatedCost = (tokensData._sum.tokens_used || 0) * 3 / 1000000

    const messagesByDay = messagesByDayRaw.map(entry => ({
      date: entry.date,
      count: Number(entry.count)
    }))

    const tokensByDay = tokensByDayRaw.map(entry => ({
      date: entry.date,
      total_tokens: Number(entry.total_tokens)
    }))

    res.json({
      summary: {
        total_conversations: totalConversations,
        total_messages: totalMessages,
        messages_this_month: messagesThisMonth,
        messages_last_month: messagesLastMonth,
        growth_rate: parseFloat(growthRate),
        total_tokens: tokensData._sum.tokens_used || 0,
        estimated_cost: estimatedCost.toFixed(2),
        tier: req.user.tier,
        messages_limit: req.user.tier === 'FREE' ? 50 : -1,
        messages_used: req.user.messages_used_this_month
      },
      charts: {
        messages_by_day: messagesByDay,
        tokens_by_day: tokensByDay
      },
      top_conversations: topConversations,
      usage_logs: usageLogs
    })
  } catch (error) {
    logger.error('Analytics error:', error)
    res.status(500).json({ error: 'Failed to fetch analytics' })
  }
})

router.get('/usage', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { start_date, end_date } = req.query

    const startDate = start_date ? new Date(start_date as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const endDate = end_date ? new Date(end_date as string) : new Date()

    const usage = await prisma.usageLog.findMany({
      where: {
        user_id: req.user.id,
        created_at: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    })

    const summary = {
      total_events: usage.length,
      total_tokens: usage.reduce((sum, log) => sum + (log.tokens_used || 0), 0),
      total_cost: usage.reduce((sum, log) => sum + parseFloat(log.cost_usd?.toString() || '0'), 0),
      by_event_type: {} as Record<string, number>
    }

    usage.forEach(log => {
      summary.by_event_type[log.event_type] = (summary.by_event_type[log.event_type] || 0) + 1
    })

    res.json({
      usage,
      summary,
      period: {
        start: startDate,
        end: endDate
      }
    })
  } catch (error) {
    logger.error('Usage stats error:', error)
    res.status(500).json({ error: 'Failed to fetch usage stats' })
  }
})

export default router
