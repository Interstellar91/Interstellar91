import nodemailer from 'nodemailer'
import { logger } from '../utils/logger'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

export async function sendEmail(options: {
  to: string
  subject: string
  html: string
}) {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: options.to,
    subject: options.subject,
    html: options.html
  }

  const info = await transporter.sendMail(mailOptions)
  logger.info(`Email sent: ${info.messageId}`)
  return info
}
