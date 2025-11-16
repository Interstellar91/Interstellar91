import { Router, Response } from 'express'
import { prisma } from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { validateTier, checkMessageLimit, incrementMessageCount } from '../middleware/validateTier'
import { claudeService } from '../services/claude.service'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'

const router = Router()

router.post('/:conversationId', authenticate, validateTier('FREE'), async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params
    const { content } = req.body

    if (!content || content.trim().length === 0) {
      throw new AppError('Message content is required', 400)
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        user_id: req.user.id
      }
    })

    if (!conversation) {
      throw new AppError('Conversation not found', 404)
    }

    const canSend = await checkMessageLimit(req.user.id, req.user.tier)
    if (!canSend) {
      throw new AppError(
        'Monthly message limit reached. Upgrade to Premium for unlimited messages.',
        403,
        'LIMIT_REACHED',
        {
          tier: req.user.tier,
          upgrade_url: `${process.env.FRONTEND_URL}/pricing`
        }
      )
    }

    const userMessage = await prisma.message.create({
      data: {
        conversation_id: conversationId,
        role: 'USER',
        content: content.trim()
      }
    })

    const recentMessages = await prisma.message.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: 'desc' },
      take: 20
    })

    recentMessages.reverse()

    const userContext = {
      industry: req.user.industry,
      country: req.user.country,
      company: req.user.company,
      totalConversations: await prisma.conversation.count({
        where: { user_id: req.user.id }
      })
    }

    const claudeResponse = await claudeService.sendMessage(recentMessages, userContext)

    const assistantMessage = await prisma.message.create({
      data: {
        conversation_id: conversationId,
        role: 'ASSISTANT',
        content: claudeResponse.content,
        tokens: claudeResponse.tokens,
        model: claudeResponse.model
      }
    })

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        last_message_at: new Date(),
        total_messages: { increment: 2 },
        tokens_used: { increment: claudeResponse.tokens },
        preview: content.substring(0, 100)
      }
    })

    await incrementMessageCount(req.user.id)

    await prisma.usageLog.create({
      data: {
        user_id: req.user.id,
        event_type: 'message_sent',
        tokens_used: claudeResponse.tokens,
        cost_usd: (claudeResponse.tokens / 1000000) * 3,
        metadata: {
          conversation_id: conversationId,
          model: claudeResponse.model
        }
      }
    })

    logger.info(`Message sent in conversation ${conversationId} by user ${req.user.id}`)

    res.json({
      userMessage,
      assistantMessage,
      tokensUsed: claudeResponse.tokens
    })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        details: error.details
      })
    }
    logger.error('Send message error:', error)
    res.status(500).json({ error: 'Failed to send message' })
  }
})

export default router
