import Anthropic from '@anthropic-ai/sdk'
import { logger } from '../utils/logger'

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('Missing ANTHROPIC_API_KEY')
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const SYSTEM_PROMPT = `Eres AIMA (Artificial Intelligence Marketing Agency), un asistente avanzado de marketing digital potenciado por Machine Learning con 15 años de experiencia simulada.

CAPACIDADES ML:
- Análisis predictivo de campañas usando patrones históricos
- Optimización de presupuestos mediante algoritmos de aprendizaje
- Segmentación inteligente de audiencias con clustering
- Predicción de rendimiento de creatividades
- A/B Testing con significancia estadística
- Forecasting de métricas (ROI, ROAS, CPA)

Especializado en Latinoamérica (Argentina, México, Colombia, Chile). Dominas Meta Ads, Google Ads, estrategia, contenido y análisis de datos.

FORMATO DE RESPUESTA ESTRUCTURADO:

📊 ANÁLISIS ML
[Análisis basado en datos y patrones]

🎯 RECOMENDACIÓN PRIORITARIA
[Acción principal optimizada por ML]

🚀 ESTRATEGIA
[Plan táctico detallado]

📈 PREDICCIÓN DE RESULTADOS
[Forecast con números específicos]

⚠️ RIESGOS
[Identificados por análisis de patrones]

📍 MÉTRICAS CLAVE
[KPIs específicos a monitorear]

💡 INSIGHT ML
[Aprendizaje del modelo basado en experiencia]

Sé técnico, preciso, usa datos concretos y demuestra tu experiencia de 15 años.`

export class ClaudeService {
  async sendMessage(messages: any[], userContext?: any) {
    try {
      const claudeMessages = messages.map(msg => ({
        role: msg.role === 'USER' ? 'user' as const : 'assistant' as const,
        content: msg.content
      }))

      let systemPrompt = SYSTEM_PROMPT
      if (userContext) {
        systemPrompt += `\n\nCONTEXTO DEL USUARIO:\n- Industria: ${userContext.industry || 'No especificada'}\n- País: ${userContext.country || 'No especificado'}\n- Empresa: ${userContext.company || 'No especificada'}\n- Conversaciones previas: ${userContext.totalConversations || 0}`
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: systemPrompt,
        messages: claudeMessages
      })

      const content = response.content[0].type === 'text' ? response.content[0].text : ''

      return {
        content,
        tokens: response.usage.input_tokens + response.usage.output_tokens,
        model: response.model
      }
    } catch (error: any) {
      logger.error('Claude API error:', error)

      if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.')
      }

      if (error.status === 400) {
        throw new Error('Invalid request to AI service')
      }

      if (error.status === 401) {
        throw new Error('AI service authentication failed')
      }

      throw new Error('Failed to get response from AI')
    }
  }

  async generateCampaignStrategy(params: {
    platform: string
    objective: string
    budget: number
    location: string
    industry: string
  }) {
    const prompt = `Genera una estrategia completa de ${params.platform} Ads:

PARÁMETROS:
- Objetivo: ${params.objective}
- Presupuesto: ${params.budget} USD
- Ubicación: ${params.location}
- Industria: ${params.industry}

INCLUYE:
1. Estructura de campaña óptima
2. Segmentación de audiencias detallada
3. Estrategia de puja recomendada
4. Formatos de anuncios más efectivos
5. Predicción de métricas (ROAS, CPA, CTR esperados)
6. Timeline de implementación (semana por semana)
7. KPIs críticos a monitorear
8. Red flags y cómo evitarlos

Usa tu experiencia de 15 años para dar recomendaciones específicas y accionables.`

    return this.sendMessage([
      { role: 'USER', content: prompt }
    ])
  }

  async analyzeCompetitor(data: {
    name: string
    industry: string
    strengths: string
    weaknesses: string
  }) {
    const prompt = `ANÁLISIS DE COMPETENCIA:

Competidor: ${data.name}
Industria: ${data.industry}
Fortalezas identificadas: ${data.strengths}
Debilidades identificadas: ${data.weaknesses}

PROPORCIONA:
1. Análisis SWOT completo y profundo
2. Oportunidades de diferenciación (mínimo 5)
3. Estrategias concretas para capitalizar sus debilidades
4. Posicionamiento recomendado en el mercado
5. Tácticas de marketing específicas para ganar cuota
6. Predicción de su respuesta a nuestras estrategias
7. Roadmap de 90 días para superarlos

Sé específico y accionable.`

    return this.sendMessage([
      { role: 'USER', content: prompt }
    ])
  }

  async generateContent(params: {
    type: string
    topic: string
    tone: string
    length: string
  }) {
    const prompt = `GENERACIÓN DE CONTENIDO:

Tipo: ${params.type}
Tema: ${params.topic}
Tono: ${params.tone}
Longitud: ${params.length}

ENTREGA:
1. El contenido completo y optimizado
2. Rationale detallado de decisiones creativas
3. 3 variaciones adicionales del contenido
4. CTA recomendado y por qué
5. Hashtags/keywords relevantes (si aplica)
6. Mejores horarios para publicar
7. Predicción de engagement esperado

Crea contenido de nivel profesional que convierta.`

    return this.sendMessage([
      { role: 'USER', content: prompt }
    ])
  }
}

export const claudeService = new ClaudeService()
