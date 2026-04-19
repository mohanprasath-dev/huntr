import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          background: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
          padding: '0',
          overflow: 'hidden',
        }}
      >
        {/* Blue left accent bar */}
        <div
          style={{
            width: '6px',
            background: '#0066ff',
            flexShrink: 0,
          }}
        />

        {/* Left content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '60px 56px',
            gap: '0px',
          }}
        >
          {/* Logo */}
          <div
            style={{
              fontSize: '88px',
              fontWeight: '800',
              color: '#111827',
              lineHeight: '1',
              letterSpacing: '-4px',
            }}
          >
            huntr
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: '38px',
              color: '#374151',
              marginTop: '20px',
              lineHeight: '1.3',
              fontWeight: '500',
            }}
          >
            Your AI Sales Team.
          </div>
          <div
            style={{
              fontSize: '38px',
              color: '#374151',
              lineHeight: '1.3',
              fontWeight: '500',
            }}
          >
            Without the Payroll.
          </div>

          {/* Pill */}
          <div
            style={{
              marginTop: '32px',
              background: '#eff6ff',
              color: '#1d4ed8',
              padding: '10px 20px',
              borderRadius: '999px',
              fontSize: '20px',
              fontWeight: '500',
              display: 'flex',
              width: 'fit-content',
            }}
          >
            Powered by Google ADK + Gemini 2.5
          </div>

          {/* Stats row */}
          <div
            style={{
              marginTop: '40px',
              display: 'flex',
              gap: '32px',
            }}
          >
            {[
              ['2 min', 'per campaign'],
              ['5 agents', 'autonomous'],
              ['₹0', 'per lead'],
            ].map(([val, label]) => (
              <div key={val} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#111827' }}>{val}</div>
                <div style={{ fontSize: '16px', color: '#9ca3af' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* URL */}
          <div
            style={{
              marginTop: 'auto',
              paddingTop: '40px',
              fontSize: '20px',
              color: '#9ca3af',
            }}
          >
            huntr.mohanprasath.dev
          </div>
        </div>

        {/* Right dark panel */}
        <div
          style={{
            width: '340px',
            background: '#0a0a0a',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '48px 40px',
            gap: '0px',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: '13px',
              color: '#6b7280',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              marginBottom: '24px',
            }}
          >
            AGENT PIPELINE
          </div>

          {[
            ['Scout', 'Flash'],
            ['Researcher', 'Flash'],
            ['Scorer', 'Flash'],
            ['Outreach', 'Pro'],
            ['Followup', 'Flash'],
          ].map(([agent, model]) => (
            <div
              key={agent}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: '1px solid #1a1a1a',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#16a34a',
                    flexShrink: 0,
                  }}
                />
                <div style={{ fontSize: '22px', color: '#ffffff', fontWeight: '500' }}>
                  {agent}
                </div>
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: model === 'Pro' ? '#60a5fa' : '#6b7280',
                  background: model === 'Pro' ? '#1e3a5f' : '#1a1a1a',
                  padding: '3px 10px',
                  borderRadius: '999px',
                }}
              >
                {model === 'Pro' ? 'Gemini Pro' : 'Flash'}
              </div>
            </div>
          ))}

          <div
            style={{
              marginTop: '24px',
              fontSize: '16px',
              color: '#0066ff',
              fontWeight: '500',
            }}
          >
            Built by Mohan Prasath P
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
