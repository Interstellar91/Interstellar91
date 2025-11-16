import { stripe } from '../config/stripe'
import { logger } from '../utils/logger'

export class StripeService {
  async createCustomer(params: { email: string; name?: string; metadata?: Record<string, string> }) {
    const customer = await stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: params.metadata
    })

    logger.info(`Stripe customer created: ${customer.id}`)
    return customer
  }
}

export const stripeService = new StripeService()
