import { Router, Response } from 'express'
import { prisma } from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { validateTier, checkConversationLimit } from '../middleware/validateTier'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'

const router = Router()

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { user_id: req.user.id },
      orderBy: { last_message_at: 'desc' },
      include: {
        messages: {
          take: 1,
          orderBy: { created_at: 'desc' }
        },
        _count: {
          select: { messages: true }
        }
      }
    })

    res.json({ conversations })
  } catch (error) {
    logger.error('Get conversations error:', error)
    res.status(500).json({ error: 'Failed to fetch conversations' })
  }
})

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: req.params.id,
        user_id: req.user.id
      },
      include: {
        messages: {
          orderBy: { created_at: 'asc' }
        }
      }
    })

    if (!conversation) {
      throw new AppError('Conversation not found', 404)
    }

    res.json({ conversation })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    logger.error('Get conversation error:', error)
    res.status(500).json({ error: 'Failed to fetch conversation' })
  }
})

router.post('/', authenticate, validateTier('FREE'), async (req: AuthRequest, res: Response) => {
  try {
    const { title } = req.body

    const canCreate = await checkConversationLimit(req.user.id, req.user.tier)
    if (!canCreate) {
      throw new AppError(
        'Conversation limit reached. Upgrade to Premium for unlimited conversations.',
        403,
        'LIMIT_REACHED'
      )
    }

    const conversation = await prisma.conversation.create({
      data: {
        user_id: req.user.id,
        title: title || 'Nueva conversación',
        last_message_at: new Date()
      }
    })

    logger.info(`Conversation created: ${conversation.id} by user ${req.user.id}`)

    res.status(201).json({ conversation })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code })
    }
    logger.error('Create conversation error:', error)
    res.status(500).json({ error: 'Failed to create conversation' })
  }
})

router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { title, tags, is_favorite, folder } = req.body

    const conversation = await prisma.conversation.updateMany({
      where: {
        id: req.params.id,
        user_id: req.user.id
      },
      data: {
        title,
        tags,
        is_favorite,
        folder,
        updated_at: new Date()
      }
    })

    if (conversation.count === 0) {
      throw new AppError('Conversation not found', 404)
    }

    res.json({ message: 'Conversation updated' })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    res.status(500).json({ error: 'Failed to update conversation' })
  }
})

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await prisma.conversation.deleteMany({
      where: {
        id: req.params.id,
        user_id: req.user.id
      }
    })

    if (deleted.count === 0) {
      throw new AppError('Conversation not found', 404)
    }

    logger.info(`Conversation deleted: ${req.params.id}`)

    res.json({ message: 'Conversation deleted successfully' })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    res.status(500).json({ error: 'Failed to delete conversation' })
  }
})

export default router
