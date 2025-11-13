import { Router, Request, Response } from 'express'
import Stripe from 'stripe'
import { stripe } from '../config/stripe'
import { prisma } from '../config/database'
import { logger } from '../utils/logger'

const router = Router()

router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string

  if (!sig) {
    return res.status(400).send('No signature found')
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    logger.error('Webhook signature verification failed:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  logger.info(`Webhook received: ${event.type}`)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutCompleted(session)
        break
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionUpdated(subscription)
        break
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionDeleted(subscription)
        break
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        await handleInvoicePaymentSucceeded(invoice)
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        await handleInvoicePaymentFailed(invoice)
        break
      }
      default:
        logger.info(`Unhandled event type: ${event.type}`)
    }

    res.json({ received: true })
  } catch (error) {
    logger.error('Webhook handler error:', error)
    res.status(500).json({ error: 'Webhook handler failed' })
  }
})

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id
  const plan = session.metadata?.plan

  if (!userId || !plan) {
    logger.error('Missing metadata in checkout session')
    return
  }

  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  )

  await prisma.user.update({
    where: { id: userId },
    data: {
      tier: plan as any,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      current_period_end: new Date(subscription.current_period_end * 1000),
      messages_used_this_month: 0
    }
  })

  logger.info(`✅ User ${userId} upgraded to ${plan}`)
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const user = await prisma.user.findUnique({
    where: { stripe_subscription_id: subscription.id }
  })

  if (!user) {
    logger.error('User not found for subscription:', subscription.id)
    return
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscription_status: subscription.status,
      current_period_end: new Date(subscription.current_period_end * 1000)
    }
  })

  logger.info(`✅ Subscription ${subscription.id} updated for user ${user.id}`)
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const user = await prisma.user.findUnique({
    where: { stripe_subscription_id: subscription.id }
  })

  if (!user) {
    logger.error('User not found for subscription:', subscription.id)
    return
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      tier: 'FREE',
      subscription_status: 'canceled',
      stripe_subscription_id: null,
      current_period_end: null
    }
  })

  logger.info(`❌ Subscription ${subscription.id} canceled for user ${user.id}`)
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  logger.info(`✅ Payment succeeded for invoice ${invoice.id}`)
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  logger.error(`❌ Payment failed for invoice ${invoice.id}`)
}

export default router
