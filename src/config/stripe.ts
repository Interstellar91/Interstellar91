import Stripe from 'stripe'
import { logger } from '../utils/logger'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  typescript: true
})

export const STRIPE_PLANS = {
  PREMIUM: {
    name: 'Premium',
    price: 29,
    priceId: process.env.STRIPE_PREMIUM_PRICE_ID!,
    features: [
      'Mensajes ilimitados',
      'Conversaciones ilimitadas',
      'Todas las calculadoras',
      'Templates premium',
      'Soporte prioritario'
    ]
  },
  PRO: {
    name: 'Pro',
    price: 79,
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
    features: [
      'Todo de Premium +',
      'API access',
      'Reportes PDF ilimitados',
      'Análisis avanzado',
      'Integraciones API',
      'White-label'
    ]
  },
  ENTERPRISE: {
    name: 'Enterprise',
    price: 299,
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID!,
    features: [
      'Todo de Pro +',
      'Multi-usuario (10 seats)',
      'Soporte dedicado',
      'SLA garantizado',
      'Modelos ML custom'
    ]
  }
}

logger.info('✅ Stripe client initialized')
