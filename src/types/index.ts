import { Request } from 'express'

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    name: string | null
    tier: string
    company: string | null
    industry: string | null
    country: string | null
    timezone: string | null
    avatar_url: string | null
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    supabase_user_id: string | null
    subscription_status: string | null
    current_period_end: Date | null
    messages_used_this_month: number
    messages_reset_date: Date | null
    created_at: Date
    last_login: Date | null
  }
  supabaseUser?: any
}

export interface ClaudeMessage {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM'
  content: string
}

export interface ClaudeResponse {
  content: string
  tokens: number
  model: string
}

export type UserTier = 'FREE' | 'PREMIUM' | 'PRO' | 'ENTERPRISE'

export type CampaignPlatform = 'META' | 'GOOGLE' | 'TIKTOK' | 'LINKEDIN' | 'TWITTER'

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
