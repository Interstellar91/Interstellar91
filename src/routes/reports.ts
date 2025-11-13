import { Router, Response } from 'express'
import { prisma } from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { validateTier, TIER_LIMITS } from '../middleware/validateTier'
import { pdfService } from '../services/pdf.service'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'

const router = Router()

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const reports = await prisma.report.findMany({
      where: { user_id: req.user.id },
      orderBy: { created_at: 'desc' }
    })

    res.json({ reports })
  } catch (error) {
    logger.error('Get reports error:', error)
    res.status(500).json({ error: 'Failed to fetch reports' })
  }
})

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const report = await prisma.report.findFirst({
      where: {
        id: req.params.id,
        user_id: req.user.id
      }
    })

    if (!report) {
      throw new AppError('Report not found', 404)
    }

    res.json({ report })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    logger.error('Get report error:', error)
    res.status(500).json({ error: 'Failed to fetch report' })
  }
})

router.post('/generate', authenticate, validateTier('PREMIUM'), async (req: AuthRequest, res: Response) => {
  try {
    const { title, type, start_date, end_date, campaign_id, conversation_id } = req.body

    if (!title || !type) {
      throw new AppError('Title and type are required', 400)
    }

    const limits = TIER_LIMITS[req.user.tier as keyof typeof TIER_LIMITS]
    if (limits.reports_per_month !== -1) {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const reportsThisMonth = await prisma.report.count({
        where: {
          user_id: req.user.id,
          created_at: {
            gte: startOfMonth
          }
        }
      })

      if (reportsThisMonth >= limits.reports_per_month) {
        throw new AppError(
          'Monthly report limit reached. Upgrade to Pro for unlimited reports.',
          403,
          'LIMIT_REACHED'
        )
      }
    }

    let reportData: any = {
      title,
      sections: []
    }

    switch (type) {
      case 'CAMPAIGN_PERFORMANCE':
        if (!campaign_id) {
          throw new AppError('campaign_id required for campaign reports', 400)
        }
        reportData = await generateCampaignReport(campaign_id, req.user.id)
        break
      case 'MONTHLY_SUMMARY':
        reportData = await generateMonthlySummary(req.user.id, start_date, end_date)
        break
      case 'CONVERSATION_SUMMARY':
        if (!conversation_id) {
          throw new AppError('conversation_id required for conversation reports', 400)
        }
        reportData = await generateConversationReport(conversation_id, req.user.id)
        break
      default:
        throw new AppError('Invalid report type', 400)
    }

    const pdfUrl = await pdfService.generateReport({
      title,
      user: req.user,
      dateRange: {
        start: start_date ? new Date(start_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: end_date ? new Date(end_date) : new Date()
      },
      sections: reportData.sections
    })

    const report = await prisma.report.create({
      data: {
        user_id: req.user.id,
        title,
        type,
        campaign_id: type === 'CAMPAIGN_PERFORMANCE' ? campaign_id : null,
        conversation_id: type === 'CONVERSATION_SUMMARY' ? conversation_id : null,
        start_date: start_date ? new Date(start_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end_date: end_date ? new Date(end_date) : new Date(),
        data: reportData,
        pdf_url: pdfUrl
      }
    })

    await prisma.usageLog.create({
      data: {
        user_id: req.user.id,
        event_type: 'report_generated',
        metadata: {
          report_id: report.id,
          report_type: type
        }
      }
    })

    logger.info(`Report generated: ${report.id} by user ${req.user.id}`)

    res.json({ report })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code })
    }
    logger.error('Generate report error:', error)
    res.status(500).json({ error: 'Failed to generate report' })
  }
})

async function generateCampaignReport(campaignId: string, userId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      user_id: userId
    }
  })

  if (!campaign) {
    throw new AppError('Campaign not found', 404)
  }

  return {
    sections: [
      {
        title: 'Campaign Overview',
        content: `Name: ${campaign.name}\nPlatform: ${campaign.platform}\nObjective: ${campaign.objective}\nStatus: ${campaign.status}`
      },
      {
        title: 'Budget',
        content: `Total Budget: ${campaign.budget_total} ${campaign.currency}\nSpent: ${campaign.budget_spent} ${campaign.currency}\nRemaining: ${parseFloat(campaign.budget_total.toString()) - parseFloat(campaign.budget_spent.toString())} ${campaign.currency}`
      },
      {
        title: 'Performance',
        metrics: [
          { label: 'Impressions', value: campaign.impressions?.toLocaleString() || 'N/A' },
          { label: 'Clicks', value: campaign.clicks?.toLocaleString() || 'N/A' },
          { label: 'Conversions', value: campaign.conversions?.toLocaleString() || 'N/A' },
          { label: 'CPA', value: campaign.cpa ? `${campaign.cpa}` : 'N/A' },
          { label: 'ROAS', value: campaign.roas ? `${campaign.roas}x` : 'N/A' }
        ]
      }
    ]
  }
}

async function generateMonthlySummary(userId: string, startDate?: string, endDate?: string) {
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const end = endDate ? new Date(endDate) : new Date()

  const conversations = await prisma.conversation.count({
    where: {
      user_id: userId,
      created_at: { gte: start, lte: end }
    }
  })

  const messages = await prisma.message.count({
    where: {
      conversation: { user_id: userId },
      created_at: { gte: start, lte: end }
    }
  })

  const tokensData = await prisma.conversation.aggregate({
    where: {
      user_id: userId,
      created_at: { gte: start, lte: end }
    },
    _sum: { tokens_used: true }
  })

  return {
    sections: [
      {
        title: 'Activity Summary',
        content: `Period: ${start.toLocaleDateString()} - ${end.toLocaleDateString()}`
      },
      {
        title: 'Metrics',
        metrics: [
          { label: 'Conversations', value: conversations.toString() },
          { label: 'Messages', value: messages.toString() },
          { label: 'Tokens Used', value: (tokensData._sum.tokens_used || 0).toLocaleString() }
        ]
      }
    ]
  }
}

async function generateConversationReport(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      user_id: userId
    },
    include: {
      messages: true
    }
  })

  if (!conversation) {
    throw new AppError('Conversation not found', 404)
  }

  return {
    sections: [
      {
        title: 'Conversation Details',
        content: `Title: ${conversation.title}\nMessages: ${conversation.total_messages}\nTokens: ${conversation.tokens_used}`
      },
      {
        title: 'Timeline',
        content: `Created: ${conversation.created_at.toLocaleString()}\nLast Activity: ${conversation.last_message_at?.toLocaleString() || 'N/A'}`
      }
    ]
  }
}

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await prisma.report.deleteMany({
      where: {
        id: req.params.id,
        user_id: req.user.id
      }
    })

    if (deleted.count === 0) {
      throw new AppError('Report not found', 404)
    }

    res.json({ message: 'Report deleted successfully' })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    logger.error('Delete report error:', error)
    res.status(500).json({ error: 'Failed to delete report' })
  }
})

export default router
