import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'

export const prisma = new PrismaClient()

prisma.$use(async (params, next) => {
  try {
    return await next(params)
  } catch (error) {
    logger.error('Prisma error:', error)
    throw error
  }
})

process.on('beforeExit', async () => {
  await prisma.$disconnect()
})
