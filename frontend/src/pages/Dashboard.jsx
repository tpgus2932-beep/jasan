import { useEffect, useState } from 'react'
import { useApp } from '../App'
import { getSavings, getHoldings, getISA, getCryptoHistory, getYearly, getRealEstate, getMonthly } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'

const won     = n => Math.round(n).toLocaleString('ko-KR')
const wonFull = n => Math.round(n).toLocaleString('ko-KR') + '원'
const pct     = n => (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'

// 억/만 단위 축약
const shortWon = n => {
  const abs = Math.abs(n)
  if (abs >= 1e8) return (n / 1e8).toFixed(1) + '억'
  if (abs >= 1e4) return Math.round(n / 1e4).toLocaleString('ko-KR') + '만'
  return Math.round(n).toLocaleString('ko-KR')
}

const COLORS_LIGHT = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#94a3b8']
const COLORS_DARK  = ['#5b8ff9', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#64748b']

function reAssetValue(r) {
  return r.type === '매매' ? (r.current_value || r.purchase_price || 0) : (r.deposit || 0)
}

function RateBadge({ rate }) {
  if (rate === null) return <span className="txt-m">—</span>
  return <span className={`badge ${rate >= 0 ? 'badge-green' : 'badge-red'}`}>{pct(rate)}</span>
}

export default function Dashboard({ onNavigate }) {
  const { fx, theme } = useApp()
  const [data, setData]         = useState({ savings: [], holdings: [], isa: [], crypto: [], realestate: [], yearly: [], monthly: [] })
  const [trendTab, setTrendTab]     = useState('yearly')
  const [baselineYm, setBaselineYm] = useState(null)
  const [chartPeriod, setChartPeriod] = useState('all')

  useEffect(() => {
    Promise.all([getSavings(), getHoldings(), getISA(), getCryptoHistory(), getRealEstate(), getYearly(), getMonthly()])
      .then(([savings, holdings, isa, crypto, realestate, yearly, monthly]) =>
        setData({ savings, holdings, isa, crypto, realestate, yearly, monthly }))
      .catch(() => {})
  }, [])

  // 월간기록 정렬
  const sortedMonthly = [...data.monthly].sort((a, b) => a.year_month.localeCompare(b.year_month))

  // 기준 월 자동 선택: 마지막 이전 기록
  useEffect(() => {
    if (sortedMonthly.length >= 1 && !baselineYm) {
      const idx = sortedMonthly.length >= 2 ? sortedMonthly.length - 2 : 0
      setBaselineYm(sortedMonthly[idx].year_month)
    }
  }, [data.monthly])

  // ── 현재 자산 ──────────────────────────────────────────────────
  const savTotal  = data.savings.reduce((s, a) => s + (a.balance || 0), 0)
  const ovUsd     = data.holdings.reduce((s, h) => s + h.shares * h.price, 0)
  const ovKrw     = ovUsd * fx
  const isaVal    = data.isa.length ? data.isa[data.isa.length - 1].value : 0
  const cryptoVal = data.crypto.length ? data.crypto[data.crypto.length - 1].value : 0
  const isaPrev   = data.isa.length > 1 ? data.isa[data.isa.length - 2].value : null
  const isaChange = isaPrev !== null ? isaVal - isaPrev : null
  const isaDate   = data.isa.length ? data.isa[data.isa.length - 1].date : null
  const activeRE  = data.realestate.filter(r => r.status === 'active')
  const reNet     = activeRE.reduce((s, r) => s + reAssetValue(r) - (r.debt || 0), 0)
  const total     = savTotal + ovKrw + isaVal + cryptoVal + reNet

  // ── 연간 수익률 (StatCard용) ──────────────────────────────────
  const sortedY    = [...data.yearly].sort((a, b) => a.year - b.year)
  const last2      = sortedY.slice(-2)
  const prevY      = last2.length === 2 ? last2[0] : null
  const curY       = last2.length === 2 ? last2[1] : null
  const growthAmt  = curY && prevY ? curY.total - prevY.total : null
  const growthRate = curY && prevY && prevY.total > 0 ? growthAmt / prevY.total * 100 : null
  const totalInvY  = curY ? (curY.inv_savings||0)+(curY.inv_overseas||0)+(curY.inv_isa||0)+(curY.inv_crypto||0)+(curY.inv_real_estate||0) : 0
  const pureGrowthRate = curY && prevY && prevY.total > 0 && totalInvY > 0
    ? (growthAmt - totalInvY) / prevY.total * 100 : null

  // ── 자산별 수익률 테이블 ──────────────────────────────────────
  const baselineRec = sortedMonthly.find(r => r.year_month === baselineYm) || null

  // 기준 이후 월간기록의 inv_* 합산
  const invSince = sortedMonthly
    .filter(r => baselineYm && r.year_month > baselineYm)
    .reduce((acc, r) => ({
      savings:     acc.savings     + (r.inv_savings     || 0),
      overseas:    acc.overseas    + (r.inv_overseas    || 0),
      isa:         acc.isa         + (r.inv_isa         || 0),
      crypto:      acc.crypto      + (r.inv_crypto      || 0),
      real_estate: acc.real_estate + (r.inv_real_estate || 0),
    }), { savings: 0, overseas: 0, isa: 0, crypto: 0, real_estate: 0 })

  const CATS = [
    { key: 'savings',     label: '적금',    icon: '🏦', cur: savTotal },
    { key: 'overseas',    label: '해외직투', icon: '🌐', cur: ovKrw   },
    { key: 'isa',         label: 'ISA',     icon: '📈', cur: isaVal  },
    { key: 'crypto',      label: '코인',    icon: '₿',  cur: cryptoVal },
    { key: 'real_estate', label: '부동산',  icon: '🏠', cur: reNet   },
  ]

  const catRows = CATS.map(c => {
    const base    = baselineRec ? (baselineRec[c.key] || 0) : null
    const inv     = invSince[c.key] || 0
    const change  = base !== null ? c.cur - base : null
    const chgRate = base !== null && base > 0 ? change / base * 100 : null
    const pureRate = base !== null && base > 0
      ? (change - inv) / base * 100
      : null
    return { ...c, base, inv, change, chgRate, pureRate }
  })

  const totBase    = baselineRec ? catRows.reduce((s, r) => s + (r.base || 0), 0) : null
  const totInv     = catRows.reduce((s, r) => s + r.inv, 0)
  const totChange  = totBase !== null ? total - totBase : null
  const totChgRate = totBase !== null && totBase > 0 ? totChange / totBase * 100 : null
  const totPureRate = totBase !== null && totBase > 0 ? (totChange - totInv) / totBase * 100 : null

  // ── 리밸런싱 알림 ─────────────────────────────────────────────
  const needsRebal = data.holdings.filter(h => {
    const owner = h.owner || 'me'
    const ownerUsd = data.holdings
      .filter(item => (item.owner || 'me') === owner)
      .reduce((s, item) => s + item.shares * item.price, 0)
    if (!ownerUsd) return false
    return Math.abs(h.shares * h.price / ownerUsd * 100 - h.target) > 4
  })

  const COLORS      = theme === 'dark' ? COLORS_DARK : COLORS_LIGHT
  const tickStyle   = { fill: theme === 'dark' ? '#666c85' : '#6c7293', fontSize: 11 }
  const tooltipStyle = {
    background: theme === 'dark' ? '#191c22' : '#ffffff',
    border: `1px solid ${theme === 'dark' ? '#282c38' : '#e2e4eb'}`,
    borderRadius: 10, color: theme === 'dark' ? '#edeef2' : '#0d0f14',
    fontSize: 12, padding: '10px 14px',
    boxShadow: theme === 'dark' ? '0 8px 24px rgba(0,0,0,.4)' : '0 8px 24px rgba(0,0,0,.1)',
  }

  const toBarRow = r => ({
    name: r.year ? `${r.year}` : r.year_month,
    '적금':     Math.round((r.savings     || 0) / 1e4),
    '해외직투': Math.round((r.overseas    || 0) / 1e4),
    'ISA':      Math.round((r.isa         || 0) / 1e4),
    '코인':     Math.round((r.crypto      || 0) / 1e4),
    '부동산':   Math.round((r.real_estate || 0) / 1e4),
    '기타':     Math.round((r.other       || 0) / 1e4),
  })

  const barData = sortedY.map(toBarRow)
  const filteredMonthly = chartPeriod === '6m'
    ? sortedMonthly.slice(-6)
    : chartPeriod === '12m'
      ? sortedMonthly.slice(-12)
      : sortedMonthly
  const monthlyBarData = filteredMonthly.map(toBarRow)
  const activeBarData  = trendTab === 'yearly' ? barData : monthlyBarData

  const pieData = [
    { name: '적금',     value: savTotal },
    { name: '해외직투', value: ovKrw    },
    { name: 'ISA',      value: isaVal   },
    { name: '코인',     value: cryptoVal },
    { name: '부동산',   value: reNet    },
  ].filter(d => d.value > 0)

  const tabBtn = active => ({
    padding: '3px 12px', fontSize: 12, borderRadius: 6,
    border: `1px solid ${theme === 'dark' ? '#282c38' : '#e2e4eb'}`,
    background: active ? '#2563eb' : 'transparent',
    color: active ? '#fff' : (theme === 'dark' ? '#8892aa' : '#6c7293'),
    cursor: 'pointer', transition: 'all .15s',
  })

  const selectStyle = {
    fontSize: 12, borderRadius: 6, padding: '3px 8px',
    border: `1px solid ${theme === 'dark' ? '#282c38' : '#e2e4eb'}`,
    background: theme === 'dark' ? '#191c22' : '#fff',
    color: theme === 'dark' ? '#edeef2' : '#0d0f14',
    cursor: 'pointer',
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <div><h2>대시보드</h2><p>전체 자산 현황</p></div>
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

      {/* ── 자산 현황 카드 ── */}
      <div className="grid-4">
        <StatCard accent="blue" label="총 자산"
          value={`${won(total)}원`}
          sub={new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
        />
        <StatCard accent="orange" label="키움 ISA"
          value={`${won(isaVal)}원`}
          valueColor={isaChange !== null ? (isaChange >= 0 ? 'colored-green' : 'colored-red') : ''}
          sub={isaDate ? `${isaDate} 기준${isaChange !== null ? ` · ${isaChange >= 0 ? '+' : ''}${wonFull(isaChange)}` : ''}` : '기록 없음'}
          tag={<span className="badge badge-muted">{data.isa.length}건</span>}
        />
        <StatCard accent="orange" label="해외직투"
          value={`$${ovUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
          sub={`${won(ovKrw)}원 · 환율 ${won(fx)}원`}
          tag={<span className="badge badge-muted">{data.holdings.length}종목</span>}
        />
        <StatCard accent="gray" label="코인"
          value={`${won(cryptoVal)}원`}
          sub={data.crypto.length ? `${data.crypto[data.crypto.length - 1].date} 기준` : '기록 없음'}
          tag={<span className="badge badge-muted">업비트</span>}
        />
      </div>

      {/* ── 전년 수익률 카드 ── */}
      <div className="grid-4">
        <StatCard
          accent={growthRate === null ? 'gray' : growthRate >= 0 ? 'green' : 'red'}
          label="전년 총 증감률"
          value={growthRate !== null ? pct(growthRate) : '-'}
          valueColor={growthRate !== null ? (growthRate >= 0 ? 'colored-green' : 'colored-red') : ''}
          sub={growthAmt !== null ? `${growthAmt >= 0 ? '+' : ''}${wonFull(growthAmt)}` : '연간기록을 입력하세요'}
          tag={curY ? <span className={`badge ${growthRate >= 0 ? 'badge-green' : 'badge-red'}`}>{prevY?.year} → {curY?.year}</span> : null}
        />
        <StatCard
          accent={pureGrowthRate === null ? 'gray' : pureGrowthRate >= 0 ? 'green' : 'red'}
          label="전년 순수 수익률"
          value={pureGrowthRate !== null ? pct(pureGrowthRate) : '-'}
          valueColor={pureGrowthRate !== null ? (pureGrowthRate >= 0 ? 'colored-green' : 'colored-red') : ''}
          sub={pureGrowthRate !== null
            ? `추가투자 ${wonFull(totalInvY)} 제외`
            : totalInvY === 0 && growthRate !== null
              ? '연간기록에 카테고리별 추가투자금을 입력하세요'
              : '연간기록을 입력하세요'}
          tag={curY && pureGrowthRate !== null ? <span className={`badge ${pureGrowthRate >= 0 ? 'badge-green' : 'badge-red'}`}>{prevY?.year} → {curY?.year}</span> : null}
        />
      </div>

      {/* ── 자산별 수익률 테이블 ── */}
      <div className="card section">
        <div className="section-header">
          <div className="section-title">자산별 수익률</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="txt-m" style={{ fontSize: 12 }}>비교 기준</span>
            {sortedMonthly.length === 0 ? (
              <span className="txt-m" style={{ fontSize: 12 }}>월간기록 없음</span>
            ) : (
              <select
                style={selectStyle}
                value={baselineYm || ''}
                onChange={e => setBaselineYm(e.target.value)}
              >
                {sortedMonthly.map(r => (
                  <option key={r.year_month} value={r.year_month}>{r.year_month}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {!baselineRec ? (
          <div className="empty">
            <div className="empty-icon">📊</div>
            <p>월간기록을 추가하면 수익률을 비교할 수 있습니다</p>
          </div>
        ) : (
          <>
            <div className="asset-rate-mobile">
              {catRows.map(r => (
                <div className="asset-rate-card" key={r.key}>
                  <div className="asset-rate-card-head">
                    <strong><span>{r.icon}</span>{r.label}</strong>
                    <RateBadge rate={r.chgRate} />
                  </div>
                  <div className="asset-rate-card-grid">
                    <span>기준</span><b>{r.base !== null ? shortWon(r.base) : '—'}</b>
                    <span>현재</span><b>{shortWon(r.cur)}</b>
                    <span>증감</span>
                    <b className={r.change >= 0 ? 'txt-s' : 'txt-d'}>
                      {r.change !== null ? `${r.change >= 0 ? '+' : ''}${shortWon(r.change)}` : '—'}
                    </b>
                    <span>추가투자</span><b>{r.inv > 0 ? shortWon(r.inv) : '—'}</b>
                    <span>순수 수익률</span>
                    <b>{r.inv > 0 ? <RateBadge rate={r.pureRate} /> : <span className="txt-m">=</span>}</b>
                  </div>
                </div>
              ))}
              <div className="asset-rate-card asset-rate-total">
                <div className="asset-rate-card-head">
                  <strong>합계</strong>
                  <RateBadge rate={totChgRate} />
                </div>
                <div className="asset-rate-card-grid">
                  <span>기준</span><b>{totBase !== null ? shortWon(totBase) : '—'}</b>
                  <span>현재</span><b>{shortWon(total)}</b>
                  <span>증감</span>
                  <b className={totChange >= 0 ? 'txt-s' : 'txt-d'}>
                    {totChange !== null ? `${totChange >= 0 ? '+' : ''}${shortWon(totChange)}` : '—'}
                  </b>
                  <span>추가투자</span><b>{totInv > 0 ? shortWon(totInv) : '—'}</b>
                  <span>순수 수익률</span>
                  <b>{totInv > 0 ? <RateBadge rate={totPureRate} /> : <span className="txt-m">=</span>}</b>
                </div>
              </div>
            </div>
            <div className="table-mobile-cards">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>카테고리</th>
                    <th className="num">기준 잔액<br /><span style={{ fontWeight: 400, opacity: 0.6 }}>({baselineYm})</span></th>
                    <th className="num">현재 잔액</th>
                    <th className="num">증감액</th>
                    <th className="num">총 증감률</th>
                    <th className="num">추가투자</th>
                    <th className="num">순수 수익률</th>
                  </tr>
                </thead>
                <tbody>
                  {catRows.map(r => (
                    <tr key={r.key}>
                      <td>
                        <span style={{ marginRight: 6 }}>{r.icon}</span>
                        <strong>{r.label}</strong>
                      </td>
                      <td className="num txt-m" data-label={`기준(${baselineYm})`}>
                        {r.base !== null ? shortWon(r.base) : '—'}
                      </td>
                      <td className="num" data-label="현재 잔액">{shortWon(r.cur)}</td>
                      <td className="num" data-label="증감액">
                        {r.change !== null ? (
                          <span className={r.change >= 0 ? 'txt-s' : 'txt-d'}>
                            {r.change >= 0 ? '+' : ''}{shortWon(r.change)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="num" data-label="총 증감률"><RateBadge rate={r.chgRate} /></td>
                      <td className="num txt-m" data-label="추가투자">
                        {r.inv > 0 ? shortWon(r.inv) : <span className="txt-m">—</span>}
                      </td>
                      <td className="num" data-label="순수 수익률">
                        {r.inv > 0
                          ? <RateBadge rate={r.pureRate} />
                          : r.chgRate !== null
                            ? <span className="txt-m" title="추가투자 미입력 — 월간기록에서 입력하세요">=</span>
                            : '—'}
                      </td>
                    </tr>
                  ))}

                  {/* 합계 행 */}
                  <tr style={{ borderTop: `2px solid ${theme === 'dark' ? '#282c38' : '#e2e4eb'}`, fontWeight: 600 }}>
                    <td>합 계</td>
                    <td className="num txt-m" data-label={`기준(${baselineYm})`}>{totBase !== null ? shortWon(totBase) : '—'}</td>
                    <td className="num" data-label="현재 잔액">{shortWon(total)}</td>
                    <td className="num" data-label="증감액">
                      {totChange !== null ? (
                        <span className={totChange >= 0 ? 'txt-s' : 'txt-d'}>
                          {totChange >= 0 ? '+' : ''}{shortWon(totChange)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="num" data-label="총 증감률"><RateBadge rate={totChgRate} /></td>
                    <td className="num txt-m" data-label="추가투자">
                      {totInv > 0 ? shortWon(totInv) : <span className="txt-m">—</span>}
                    </td>
                    <td className="num" data-label="순수 수익률">
                      {totInv > 0
                        ? <RateBadge rate={totPureRate} />
                        : totChgRate !== null
                          ? <span className="txt-m">=</span>
                          : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
            <div style={{ marginTop: 8, fontSize: 11, opacity: 0.5 }}>
              순수 수익률 = 추가투자 제외 · 추가투자는 기준 이후 월간기록 합산 · <strong>=</strong> 는 추가투자 미입력 (월간기록에서 입력 가능)
            </div>
          </>
        )}
      </div>

      {/* ── 자산 추이 차트 ── */}
      <div className="grid-chart">
        <div className="card section">
          <div className="section-header">
            <div className="section-title">자산 추이</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="txt-m small">단위: 만원</span>
              {trendTab === 'monthly' && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['6m','6개월'], ['12m','12개월'], ['all','전체']].map(([v, l]) => (
                    <button key={v} style={tabBtn(chartPeriod === v)} onClick={() => setChartPeriod(v)}>{l}</button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 4 }}>
                <button style={tabBtn(trendTab === 'yearly')}  onClick={() => setTrendTab('yearly')}>연도별</button>
                <button style={tabBtn(trendTab === 'monthly')} onClick={() => setTrendTab('monthly')}>월별</button>
              </div>
            </div>
          </div>
          {activeBarData.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📊</div>
              <p>{trendTab === 'yearly' ? '연간기록을 추가하면 차트가 표시됩니다' : '월간기록을 추가하면 차트가 표시됩니다'}</p>
            </div>
          ) : (
            <div className="chart-container-lg">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activeBarData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barSize={trendTab === 'monthly' ? 14 : 28}>
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
                    data={pieData} cx="50%" cy="46%"
                    innerRadius="55%" outerRadius="75%"
                    dataKey="value" paddingAngle={3} strokeWidth={0}
                  >
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={v => [`${won(v)}원`]} />
                  <Legend
                    wrapperStyle={{ fontSize: 12, color: tickStyle.fill, paddingTop: 8 }}
                    formatter={(v, e) => (
                      <span style={{ color: tickStyle.fill }}>
                        {v}{' '}
                        <strong style={{ color: theme === 'dark' ? '#edeef2' : '#0d0f14' }}>
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
      <div className="stat-label">{label}{tag}</div>
      <div className={`stat-value ${valueColor}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}
