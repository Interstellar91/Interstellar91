import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import bodyParser from 'body-parser'
import { errorHandler } from './middleware/errorHandler'
import authRoutes from './routes/auth'
import conversationsRoutes from './routes/conversations'
import messagesRoutes from './routes/messages'
import campaignsRoutes from './routes/campaigns'
import reportsRoutes from './routes/reports'
import billingRoutes from './routes/billing'
import analyticsRoutes from './routes/analytics'
import usersRoutes from './routes/users'
import webhooksRoutes from './routes/webhooks'
import { logger } from './utils/logger'

const app = express()

app.use('/api/webhooks/stripe', bodyParser.raw({ type: 'application/json' }))

app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }))
app.use(morgan('dev'))
app.use(bodyParser.json({ limit: '1mb' }))
app.use(bodyParser.urlencoded({ extended: true }))

app.use('/api/auth', authRoutes)
app.use('/api/conversations', conversationsRoutes)
app.use('/api/messages', messagesRoutes)
app.use('/api/campaigns', campaignsRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/billing', billingRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/webhooks', webhooksRoutes)

app.use(errorHandler)

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`)
})

export default app
