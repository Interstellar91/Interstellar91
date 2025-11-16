import PDFDocument from 'pdfkit'
import { createWriteStream } from 'fs'
import { mkdir, readFile } from 'fs/promises'
import { supabase } from '../config/supabase'
import { logger } from '../utils/logger'

export class PDFService {
  async generateReport(reportData: {
    title: string
    user: any
    dateRange: { start: Date; end: Date }
    sections: any[]
  }): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        await mkdir('/tmp', { recursive: true }).catch(() => {})

        const filename = `report-${Date.now()}.pdf`
        const path = `/tmp/${filename}`

        const doc = new PDFDocument({
          size: 'A4',
          margin: 50
        })

        const stream = createWriteStream(path)
        doc.pipe(stream)

        doc
          .fontSize(24)
          .fillColor('#2563eb')
          .text('AIMA', { align: 'center' })

        doc
          .fontSize(10)
          .fillColor('#6b7280')
          .text('AI Marketing Agency', { align: 'center' })
          .moveDown()

        doc
          .fontSize(20)
          .fillColor('#111827')
          .text(reportData.title)
          .moveDown()

        doc
          .fontSize(10)
          .fillColor('#6b7280')
          .text(`Period: ${reportData.dateRange.start.toLocaleDateString()} - ${reportData.dateRange.end.toLocaleDateString()}`)
          .moveDown(2)

        reportData.sections.forEach(section => {
          doc
            .fontSize(14)
            .fillColor('#111827')
            .text(section.title)
            .moveDown(0.5)

          if (section.content) {
            doc
              .fontSize(10)
              .fillColor('#374151')
              .text(section.content, {
                lineGap: 4
              })
              .moveDown()
          }

          if (section.metrics) {
            section.metrics.forEach((metric: { label: string; value: string }) => {
              doc
                .fontSize(10)
                .fillColor('#111827')
                .text(`${metric.label}: `, { continued: true })
                .fillColor('#2563eb')
                .text(metric.value)
            })
            doc.moveDown()
          }

          if (section.table) {
            section.table.forEach((row: string[]) => {
              doc
                .fontSize(10)
                .fillColor('#374151')
                .text(row.join(' | '))
            })
            doc.moveDown()
          }

          doc.moveDown()
        })

        doc.end()

        stream.on('finish', async () => {
          try {
            const fileBuffer = await readFile(path)
            const storagePath = `reports/${filename}`

            const { error: uploadError } = await supabase.storage
              .from('reports')
              .upload(storagePath, fileBuffer, {
                contentType: 'application/pdf',
                upsert: true
              })

            if (uploadError) {
              logger.error('Failed to upload PDF to Supabase:', uploadError)
              return reject(new Error('Failed to upload report'))
            }

            const { data } = supabase.storage.from('reports').getPublicUrl(storagePath)
            resolve(data.publicUrl)
          } catch (err) {
            reject(err)
          }
        })

        stream.on('error', err => {
          reject(err)
        })
      } catch (error) {
        reject(error)
      }
    })
  }
}

export const pdfService = new PDFService()
