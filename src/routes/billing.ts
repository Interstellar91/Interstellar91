import { Router, Response } from 'express'
import { stripe, STRIPE_PLANS } from '../config/stripe'
import { prisma } from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'

const router = Router()

router.post('/create-checkout', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { plan } = req.body

    if (!['PREMIUM', 'PRO', 'ENTERPRISE'].includes(plan)) {
      throw new AppError('Invalid plan selected', 400)
    }

    const planConfig = STRIPE_PLANS[plan as keyof typeof STRIPE_PLANS]

    let customerId = req.user.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.name || undefined,
        metadata: {
          user_id: req.user.id,
          supabase_user_id: req.user.supabase_user_id
        }
      })

      customerId = customer.id

      await prisma.user.update({
        where: { id: req.user.id },
        data: { stripe_customer_id: customerId }
      })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: planConfig.priceId,
          quantity: 1
        }
      ],
      success_url: `${process.env.FRONTEND_URL}/dashboard?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?upgrade=canceled`,
      metadata: {
        user_id: req.user.id,
        plan
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto'
    })

    logger.info(`Checkout session created for user ${req.user.id}, plan: ${plan}`)

    res.json({ url: session.url })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    logger.error('Create checkout error:', error)
    res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

router.post('/portal', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user.stripe_customer_id) {
      throw new AppError('No active subscription found', 400)
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL}/dashboard/settings`
    })

    res.json({ url: session.url })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    logger.error('Create portal error:', error)
    res.status(500).json({ error: 'Failed to create portal session' })
  }
})

router.get('/subscription', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const subscription = {
      tier: req.user.tier,
      status: req.user.subscription_status,
      current_period_end: req.user.current_period_end,
      messages_used: req.user.messages_used_this_month,
      messages_limit: req.user.tier === 'FREE' ? 50 : -1,
      cancel_at_period_end: false
    }

    if (req.user.stripe_subscription_id) {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(
          req.user.stripe_subscription_id
        )
        subscription.cancel_at_period_end = stripeSubscription.cancel_at_period_end
      } catch (err) {
        logger.error('Failed to retrieve Stripe subscription:', err)
      }
    }

    res.json({ subscription })
  } catch (error) {
    logger.error('Get subscription error:', error)
    res.status(500).json({ error: 'Failed to fetch subscription' })
  }
})

export default router
