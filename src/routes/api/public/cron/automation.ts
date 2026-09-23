import { createFileRoute } from '@tanstack/react-router'
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth'

/**
 * Cron da Automação (a cada ~15 min): dispara as agendas cujo horário de
 * Brasília chegou e continua os vídeos que ficaram em andamento.
 * A idempotência e as travas de custo vivem no executor.
 */
export const Route = createFileRoute('/api/public/cron/automation')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Aceita o segredo padrão de cron do Lovable OU o token dedicado
        // usado pelo agendador do banco (pg_cron), que não enxerga env vars.
        const token = request.headers.get('x-automation-token')
        const esperado = process.env['AUTOMATION_CRON_TOKEN']
        const tokenOk = !!token && !!esperado && token === esperado
        if (!tokenOk) {
          const unauthorized = await authenticateCronRequest(request)
          if (unauthorized) return unauthorized
        }


        try {
          const { runAutomationTick } = await import('@/lib/automation-run.server')
          const result = await runAutomationTick()
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Falha no cron de automação.'
          console.error('[automacao] cron falhou', message)
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
