import { useEffect, useState } from 'react'
import { useApp } from '../App'
import { getSavings, getHoldings, getISA, getCryptoHistory, getYearly, getRealEstate } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'

const won     = n => Math.round(n).toLocaleString('ko-KR')
const wonFull = n => Math.round(n).toLocaleString('ko-KR') + '원'
const pct     = n => (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'

const COLORS_LIGHT = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#94a3b8']
const COLORS_DARK  = ['#5b8ff9', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#64748b']

function reAssetValue(r) {
  return r.type === '매매' ? (r.current_value || r.purchase_price || 0) : (r.deposit || 0)
}

export default function Dashboard({ onNavigate }) {
  const { fx, theme } = useApp()
  const [data, setData] = useState({ savings: [], holdings: [], isa: [], crypto: [], realestate: [], yearly: [] })

  useEffect(() => {
    Promise.all([getSavings(), getHoldings(), getISA(), getCryptoHistory(), getRealEstate(), getYearly()])
      .then(([savings, holdings, isa, crypto, realestate, yearly]) =>
        setData({ savings, holdings, isa, crypto, realestate, yearly }))
      .catch(() => {})
  }, [])

  const savTotal = data.savings.reduce((s, a) => s + (a.balance || 0), 0)
  const ovUsd    = data.holdings.reduce((s, h) => s + h.shares * h.price, 0)
  const ovKrw    = ovUsd * fx
  const isaVal   = data.isa.length ? data.isa[data.isa.length - 1].value : 0
  const cryptoVal = data.crypto.length ? data.crypto[data.crypto.length - 1].value : 0
  const isaPrev  = data.isa.length > 1 ? data.isa[data.isa.length - 2].value : null
  const isaChange = isaPrev !== null ? isaVal - isaPrev : null
  const isaDate  = data.isa.length ? data.isa[data.isa.length - 1].date : null
  const activeRE = data.realestate.filter(r => r.status === 'active')
  const reNet    = activeRE.reduce((s, r) => s + reAssetValue(r) - (r.debt || 0), 0)
  const total    = savTotal + ovKrw + isaVal + cryptoVal + reNet

  const sorted = [...data.yearly].sort((a, b) => a.year - b.year)
  const last2  = sorted.slice(-2)
  const growthAmt  = last2.length === 2 ? last2[1].total - last2[0].total : null
  const growthRate = last2.length === 2 && last2[0].total > 0
    ? growthAmt / last2[0].total * 100 : null

  const needsRebal = data.holdings.filter(h => {
    const owner = h.owner || 'me'
    const ownerUsd = data.holdings
      .filter(item => (item.owner || 'me') === owner)
      .reduce((s, item) => s + item.shares * item.price, 0)
    if (!ownerUsd) return false
    return Math.abs(h.shares * h.price / ownerUsd * 100 - h.target) > 4
  })

  const COLORS = theme === 'dark' ? COLORS_DARK : COLORS_LIGHT

  const tooltipStyle = {
    background: theme === 'dark' ? '#191c22' : '#ffffff',
    border: `1px solid ${theme === 'dark' ? '#282c38' : '#e2e4eb'}`,
    borderRadius: 10,
    color: theme === 'dark' ? '#edeef2' : '#0d0f14',
    fontSize: 12,
    boxShadow: theme === 'dark'
      ? '0 8px 24px rgba(0,0,0,.4)'
      : '0 8px 24px rgba(0,0,0,.1)',
    padding: '10px 14px',
  }

  const barData = sorted.map(r => ({
    name: `${r.year}`,
    '적금':     Math.round((r.savings     || 0) / 1e4),
    '해외직투': Math.round((r.overseas    || 0) / 1e4),
    'ISA':      Math.round((r.isa         || 0) / 1e4),
    '코인':     Math.round((r.crypto      || 0) / 1e4),
    '부동산':   Math.round((r.real_estate || 0) / 1e4),
    '기타':     Math.round((r.other       || 0) / 1e4),
  }))

  const pieData = [
    { name: '적금',     value: savTotal },
    { name: '해외직투', value: ovKrw },
    { name: 'ISA',      value: isaVal },
    { name: '코인',     value: cryptoVal },
    { name: '부동산',   value: reNet },
  ].filter(d => d.value > 0)

  const tickStyle = { fill: theme === 'dark' ? '#666c85' : '#6c7293', fontSize: 11 }

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h2>대시보드</h2>
          <p>전체 자산 현황</p>
        </div>
      </div>

      {needsRebal.length > 0 && (
        <div className="alert alert-warning">
          <span>⚠️</span>
          <span>
            해외직투 리밸런싱 필요 —{' '}
            <strong>{needsRebal.map(h => h.ticker).join(', ')}</strong> 종목이 목표 비중에서 4% 이상 이탈했습니다.{' '}
            <a onClick={() => onNavigate('overseas')}>확인하기 →</a>
          </span>
        </div>
      )}

      <div className="grid-4">
        <StatCard
          accent="blue"
          label="총 자산"
          value={`${won(total)}원`}
          sub={new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
        />
        <StatCard
          accent="orange"
          label="키움 ISA"
          value={`${won(isaVal)}원`}
          valueColor={isaChange !== null ? (isaChange >= 0 ? 'colored-green' : 'colored-red') : ''}
          sub={isaDate ? `${isaDate} 기준${isaChange !== null ? ` · ${isaChange >= 0 ? '+' : ''}${wonFull(isaChange)}` : ''}` : '기록 없음'}
          tag={<span className="badge badge-muted">{data.isa.length}건</span>}
        />
        <StatCard
          accent="orange"
          label="해외직투"
          value={`$${ovUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
          sub={`${won(ovKrw)}원 · 환율 ${won(fx)}원`}
          tag={<span className="badge badge-muted">{data.holdings.length}종목</span>}
        />
        <StatCard
          accent="gray"
          label="코인"
          value={`${won(cryptoVal)}원`}
          sub={data.crypto.length ? `${data.crypto[data.crypto.length - 1].date} 기준` : '기록 없음'}
          tag={<span className="badge badge-muted">업비트</span>}
        />
      </div>

      <div className="grid-4">
        <StatCard
          accent={growthRate === null ? 'gray' : growthRate >= 0 ? 'green' : 'red'}
          label="전년 대비 수익률"
          value={growthRate !== null ? pct(growthRate) : '-'}
          valueColor={growthRate !== null ? (growthRate >= 0 ? 'colored-green' : 'colored-red') : ''}
          sub={growthAmt !== null
            ? `${growthAmt >= 0 ? '+' : ''}${wonFull(growthAmt)}`
            : '연간기록을 입력하세요'}
          tag={growthRate !== null ? (
            <span className={`badge ${growthRate >= 0 ? 'badge-green' : 'badge-red'}`}>
              {last2[0]?.year} → {last2[1]?.year}
            </span>
          ) : null}
        />
      </div>

      <div className="grid-chart">
        <div className="card section">
          <div className="section-header">
            <div className="section-title">연도별 자산 추이</div>
            <span className="txt-m small">단위: 만원</span>
          </div>
          {barData.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📊</div>
              <p>연간기록을 추가하면 차트가 표시됩니다</p>
            </div>
          ) : (
            <div className="chart-container-lg">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barSize={28}>
                  <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={v => `${v}만`} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.03)' }}
                    formatter={(v, n) => [`${(v * 1e4).toLocaleString()}원`, n]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: tickStyle.fill, paddingTop: 12 }} />
                  <Bar dataKey="적금"     stackId="a" fill={COLORS[0]} radius={[0,0,0,0]} />
                  <Bar dataKey="해외직투" stackId="a" fill={COLORS[1]} radius={[0,0,0,0]} />
                  <Bar dataKey="ISA"      stackId="a" fill={COLORS[2]} radius={[0,0,0,0]} />
                  <Bar dataKey="코인"     stackId="a" fill={COLORS[3]} radius={[0,0,0,0]} />
                  <Bar dataKey="부동산"   stackId="a" fill={COLORS[4]} radius={[0,0,0,0]} />
                  <Bar dataKey="기타"     stackId="a" fill={COLORS[5] || COLORS[4]} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card section">
          <div className="section-header">
            <div className="section-title">자산 구성</div>
          </div>
          {pieData.length === 0 ? (
            <div className="empty"><p>자산 데이터를 입력하세요</p></div>
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="46%"
                    innerRadius="55%" outerRadius="75%"
                    dataKey="value"
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={v => [`${won(v)}원`]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, color: tickStyle.fill, paddingTop: 8 }}
                    formatter={(v, e) => (
                      <span style={{ color: tickStyle.fill }}>
                        {v} <strong style={{ color: theme === 'dark' ? '#edeef2' : '#0d0f14' }}>
                          {total > 0 ? ((e.payload.value / total) * 100).toFixed(1) : 0}%
                        </strong>
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, accent = 'gray', valueColor = '', tag = null }) {
  return (
    <div className={`stat-card accent-${accent}`}>
      <div className="stat-label">
        {label}
        {tag}
      </div>
      <div className={`stat-value ${valueColor}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}
