import { Router, Response } from 'express'
import { prisma } from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { validateTier } from '../middleware/validateTier'
import { claudeService } from '../services/claude.service'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'

const router = Router()

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { platform, status } = req.query

    const campaigns = await prisma.campaign.findMany({
      where: {
        user_id: req.user.id,
        ...(platform && { platform: platform as any }),
        ...(status && { status: status as any })
      },
      orderBy: {
        created_at: 'desc'
      }
    })

    res.json({ campaigns })
  } catch (error) {
    logger.error('Get campaigns error:', error)
    res.status(500).json({ error: 'Failed to fetch campaigns' })
  }
})

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: req.params.id,
        user_id: req.user.id
      }
    })

    if (!campaign) {
      throw new AppError('Campaign not found', 404)
    }

    res.json({ campaign })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    logger.error('Get campaign error:', error)
    res.status(500).json({ error: 'Failed to fetch campaign' })
  }
})

router.post('/', authenticate, validateTier('PREMIUM'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      platform,
      objective,
      budget_total,
      currency,
      location,
      age_min,
      age_max,
      interests
    } = req.body

    if (!name || !platform || !objective || !budget_total) {
      throw new AppError('Missing required fields', 400)
    }

    let strategy: string | null = null
    try {
      const aiResponse = await claudeService.generateCampaignStrategy({
        platform,
        objective,
        budget: parseFloat(budget_total),
        location: location ? location.join(', ') : 'General',
        industry: req.user.industry || 'General'
      })
      strategy = aiResponse.content
    } catch (err) {
      logger.error('AI strategy generation failed:', err)
    }

    const campaign = await prisma.campaign.create({
      data: {
        user_id: req.user.id,
        name,
        platform,
        objective,
        budget_total: parseFloat(budget_total),
        currency: currency || 'USD',
        location: location || [],
        age_min,
        age_max,
        interests: interests || [],
        strategy,
        status: 'DRAFT'
      }
    })

    logger.info(`Campaign created: ${campaign.id} by user ${req.user.id}`)

    res.status(201).json({ campaign })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    logger.error('Create campaign error:', error)
    res.status(500).json({ error: 'Failed to create campaign' })
  }
})

router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const updates = req.body

    const campaign = await prisma.campaign.updateMany({
      where: {
        id: req.params.id,
        user_id: req.user.id
      },
      data: {
        ...updates,
        updated_at: new Date()
      }
    })

    if (campaign.count === 0) {
      throw new AppError('Campaign not found', 404)
    }

    res.json({ message: 'Campaign updated successfully' })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    logger.error('Update campaign error:', error)
    res.status(500).json({ error: 'Failed to update campaign' })
  }
})

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await prisma.campaign.deleteMany({
      where: {
        id: req.params.id,
        user_id: req.user.id
      }
    })

    if (deleted.count === 0) {
      throw new AppError('Campaign not found', 404)
    }

    res.json({ message: 'Campaign deleted successfully' })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    logger.error('Delete campaign error:', error)
    res.status(500).json({ error: 'Failed to delete campaign' })
  }
})

router.post('/:id/generate-strategy', authenticate, validateTier('PREMIUM'), async (req: AuthRequest, res: Response) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: req.params.id,
        user_id: req.user.id
      }
    })

    if (!campaign) {
      throw new AppError('Campaign not found', 404)
    }

    const aiResponse = await claudeService.generateCampaignStrategy({
      platform: campaign.platform,
      objective: campaign.objective,
      budget: parseFloat(campaign.budget_total.toString()),
      location: campaign.location.join(', '),
      industry: req.user.industry || 'General'
    })

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        strategy: aiResponse.content
      }
    })

    res.json({
      strategy: aiResponse.content,
      tokens_used: aiResponse.tokens
    })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    logger.error('Generate strategy error:', error)
    res.status(500).json({ error: 'Failed to generate strategy' })
  }
})

export default router
