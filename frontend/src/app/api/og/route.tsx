import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        background: 'white',
        borderLeft: '6px solid #0066ff',
        padding: '60px',
        fontFamily: 'sans-serif'
      }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '80px', fontWeight: '800', color: '#111827', lineHeight: 1 }}>huntr</div>
          <div style={{ fontSize: '36px', color: '#374151', marginTop: '16px' }}>Your AI Sales Team.</div>
          <div style={{ fontSize: '36px', color: '#374151' }}>Without the Payroll.</div>
          <div style={{
            marginTop: '24px',
            background: '#eff6ff',
            color: '#1d4ed8',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '18px',
            display: 'flex',
            alignSelf: 'flex-start'
          }}>
            Powered by Google ADK + Gemini 2.5
          </div>
          <div style={{ marginTop: 'auto', fontSize: '20px', color: '#9ca3af' }}>
            huntr.mohanprasath.dev
          </div>
        </div>
        <div style={{
          width: '320px',
          background: '#0a0a0a',
          borderRadius: '12px',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '16px'
        }}>
          {['Scout', 'Researcher', 'Scorer', 'Outreach', 'Followup'].map(agent => (
            <div key={agent} style={{ color: '#16a34a', fontSize: '22px', display: 'flex', gap: '8px' }}>
              <span>✓</span><span>{agent}</span>
            </div>
          ))}
          <div style={{ color: '#0066ff', fontSize: '16px', marginTop: '8px' }}>
            5 agents · 2 min · ₹0 per lead
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
