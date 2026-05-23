import { useEffect, useState } from 'react'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useApp } from '../App'
import {
  getPortfolioTemplates, getPortfolioCategories, getPortfolioAllocations,
  getTickerInfo, runBacktest,
  getHoldings, getISAHoldings, getShinhanISAHoldings, getDainISAHoldings,
  getCryptoHoldings, getSavings, getRealEstate,
} from '../api'

const CURRENT_YEAR = new Date().getFullYear()

// source별 Yahoo Finance 티커 변환
function toYFTicker(sourceType, holding) {
  if (sourceType === 'overseas') {
    return holding.ticker || ''
  }
  if (sourceType === 'isa' || sourceType === 'shinhan_isa' || sourceType === 'dain_isa') {
    const t = (holding.ticker || '').trim()
    if (/^\d{6}$/.test(t)) return `${t}.KS`
    return t
  }
  if (sourceType === 'crypto') {
    const market = (holding.market || '').toUpperCase()
    const base = market.replace(/^KRW-/, '').replace(/^USD-/, '')
    return base ? `${base}-USD` : ''
  }
  // savings, realestate → 현금성
  return 'CASH'
}

// source별 현재 평가금액
function holdingValue(sourceType, holding, fx) {
  switch (sourceType) {
    case 'overseas':    return (holding.shares || 0) * (holding.price || 0) * fx
    case 'isa':
    case 'shinhan_isa':
    case 'dain_isa':    return (holding.shares || 0) * (holding.price || 0)
    case 'crypto':      return holding.value || 0
    case 'savings':     return holding.balance || 0
    case 'realestate':  return Math.max((holding.current_value || 0) - (holding.debt || 0), 0)
    default:            return 0
  }
}

// 이름 표시
function holdingLabel(sourceType, h) {
  if (sourceType === 'savings') return h.name || h.bank || ''
  if (sourceType === 'realestate') return h.name || ''
  if (sourceType === 'crypto') return h.currency || h.market || ''
  return h.name || h.ticker || ''
}

// 단일 티커 추천 (holdings 없는 카테고리용)
function suggestTicker(name) {
  const n = name.toLowerCase()
  if (n.includes('현금') || n.includes('단기채') || n.includes('예금') || n.includes('예수금')) return 'CASH'
  if (n.includes('국내주식') || n.includes('코스피') || n.includes('코스닥')) return '069500.KS'
  if (n.includes('미국주식') || n.includes('s&p') || n.includes('sp500') || n.includes('나스닥')) return 'SPY'
  if (n.includes('해외주식') || n.includes('선진국') || n.includes('글로벌')) return 'VT'
  if (n.includes('국고채') || n.includes('장기채')) return 'TLT'
  if (n.includes('채권') || n.includes('bond')) return 'AGG'
  if (n.includes('금') || n.includes('gold')) return 'GLD'
  if (n.includes('리츠') || n.includes('부동산') || n.includes('reit')) return 'VNQ'
  if (n.includes('코인') || n.includes('비트코인') || n.includes('crypto')) return 'BTC-USD'
  if (n.includes('주식') || n.includes('equity')) return 'SPY'
  return ''
}

const won = (n) => {
  const v = Math.round(n)
  if (Math.abs(v) >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억원`
  if (Math.abs(v) >= 10_000) return `${(v / 10_000).toFixed(0)}만원`
  return `${v.toLocaleString()}원`
}
const pct = (v, dp = 2) => `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '14px 18px', flex: 1, minWidth: 120,
    }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function ValueTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#2563eb', fontWeight: 600 }}>{won(payload[0].value)}</div>
    </div>
  )
}

function DrawdownTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#ef4444', fontWeight: 600 }}>{payload[0].value.toFixed(2)}%</div>
    </div>
  )
}

export default function Backtest() {
  const { fx } = useApp()

  const [templates, setTemplates]       = useState([])
  const [selectedTplId, setSelectedTplId] = useState(null)
  const [categories, setCategories]     = useState([])
  // catHoldings: {category_id: [{ticker, name, weight, sourceType}]}
  const [catHoldings, setCatHoldings]   = useState({})
  // useActual: {category_id: bool}
  const [useActual, setUseActual]       = useState({})
  // manualTicker: {category_id: string}
  const [manualTicker, setManualTicker] = useState({})

  const [startYear,  setStartYear]  = useState('2015')
  const [endYear,    setEndYear]    = useState(String(CURRENT_YEAR - 1))
  const [initInvest, setInitInvest] = useState('10,000,000')
  const [rebalFreq,  setRebalFreq]  = useState('quarterly')

  // 제외 종목: {catId: string[]} — 제외된 티커 목록
  const [excludedHoldings, setExcludedHoldings] = useState({})

  // 티커 시작일 조회
  const [tickerDates,       setTickerDates]       = useState({})     // {ticker: "YYYY-MM-DD"}
  const [minStartInfo,      setMinStartInfo]      = useState(null)   // {year, ticker, catName}
  const [tickerInfoLoading, setTickerInfoLoading] = useState(false)

  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  // 템플릿 목록 로드
  useEffect(() => {
    getPortfolioTemplates().then(data => {
      setTemplates(data)
      if (data.length > 0) setSelectedTplId(data[0].id)
    }).catch(() => {})
  }, [])

  // 템플릿 변경 시: 카테고리 + allocations + 전체 holdings 로드
  useEffect(() => {
    if (!selectedTplId) return
    setResult(null)
    setError('')
    setExcludedHoldings({})
    setTickerDates({})
    setMinStartInfo(null)

    Promise.all([
      getPortfolioCategories(selectedTplId),
      getPortfolioAllocations(selectedTplId),
      getHoldings().catch(() => []),
      getISAHoldings().catch(() => []),
      getShinhanISAHoldings().catch(() => []),
      getDainISAHoldings().catch(() => []),
      getCryptoHoldings().catch(() => []),
      getSavings().catch(() => []),
      getRealEstate().catch(() => []),
    ]).then(([cats, allocs, overseas, isa, shinhan, dain, crypto, savings, re]) => {
      const allHoldings = {
        overseas,
        isa,
        shinhan_isa: shinhan,
        dain_isa: dain,
        crypto,
        savings:     savings.filter(s => s.status === 'active'),
        realestate:  re.filter(r => r.status === 'active'),
      }

      // 카테고리별 실제 보유 종목 계산
      const holdingsMap = {}
      for (const cat of cats) {
        const catAllocs = allocs.filter(a => a.category_id === cat.id)
        const items = []
        for (const alloc of catAllocs) {
          const pool = allHoldings[alloc.source_type] || []
          const h = pool.find(x => x.id === alloc.source_id)
          if (!h) continue
          const ticker = toYFTicker(alloc.source_type, h)
          const value  = holdingValue(alloc.source_type, h, fx)
          const label  = holdingLabel(alloc.source_type, h)
          items.push({ ticker, name: label, value, sourceType: alloc.source_type })
        }
        // 같은 티커끼리 합산 (예: 여러 적금 → CASH 하나로)
        const merged = []
        const seenIdx = {}
        for (const item of items) {
          if (seenIdx[item.ticker] !== undefined) {
            merged[seenIdx[item.ticker]].value += item.value
          } else {
            seenIdx[item.ticker] = merged.length
            merged.push({ ...item })
          }
        }
        const totalVal = merged.reduce((s, i) => s + i.value, 0)
        holdingsMap[cat.id] = merged.map(i => ({
          ...i,
          weight: totalVal > 0 ? i.value / totalVal : 1 / Math.max(merged.length, 1),
        }))
      }

      setCategories(cats)
      setCatHoldings(holdingsMap)

      // 초기 manual 티커 (suggestions)
      const tickers = {}
      for (const cat of cats) tickers[cat.id] = suggestTicker(cat.name)
      setManualTicker(tickers)

      // 실제 종목이 있으면 기본 ON
      const actual = {}
      for (const cat of cats) {
        actual[cat.id] = (holdingsMap[cat.id]?.length ?? 0) > 0
      }
      setUseActual(actual)

      // 포함된 모든 티커의 최초 상장일 조회
      const uniqueTickers = [
        ...new Set(
          Object.values(holdingsMap).flat()
            .map(h => h.ticker)
            .filter(t => t && t.toUpperCase() !== 'CASH')
        ),
      ]
      if (uniqueTickers.length > 0) {
        setMinStartInfo(null)
        setTickerInfoLoading(true)
        getTickerInfo(uniqueTickers)
          .then(info => {
            setTickerDates(info)
            // 가장 늦게 시작된 티커 찾기 (= 백테스트 최소 시작일)
            // 초기 로드 시 excluded 없음 → holdingsMap 전체 기준
            let maxDate = '', maxTicker = '', maxCatName = ''
            for (const [catId, holdings] of Object.entries(holdingsMap)) {
              const cat = cats.find(c => c.id === catId)
              for (const h of holdings) {
                const d = info[h.ticker]
                if (d && d > maxDate) {
                  maxDate    = d
                  maxTicker  = h.ticker
                  maxCatName = cat?.name ?? ''
                }
              }
            }
            if (maxDate) {
              const minYear = parseInt(maxDate.slice(0, 4))
              setMinStartInfo({ year: minYear, ticker: maxTicker, catName: maxCatName })
              setStartYear(prev => parseInt(prev) < minYear ? String(minYear) : prev)
            }
          })
          .catch(() => {})
          .finally(() => setTickerInfoLoading(false))
      } else {
        setMinStartInfo(null)
      }
    }).catch(() => {})
  }, [selectedTplId, fx])

  // 제외 변경 → minStartInfo 재계산 (tickerDates 캐시 활용, API 재호출 없음)
  useEffect(() => {
    if (!Object.keys(tickerDates).length || !categories.length) return
    let maxDate = '', maxTicker = '', maxCatName = ''
    for (const cat of categories) {
      const excluded = excludedHoldings[cat.id] || []
      const actives  = (catHoldings[cat.id] || []).filter(h => !excluded.includes(h.ticker))
      for (const h of actives) {
        const d = tickerDates[h.ticker]
        if (d && d > maxDate) {
          maxDate    = d
          maxTicker  = h.ticker
          maxCatName = cat.name
        }
      }
    }
    if (maxDate) {
      const minYear = parseInt(maxDate.slice(0, 4))
      setMinStartInfo({ year: minYear, ticker: maxTicker, catName: maxCatName })
      // 최소 연도 올라가는 경우만 자동 조정 (내려갈 땐 유저가 직접 변경)
      setStartYear(prev => parseInt(prev) < minYear ? String(minYear) : prev)
    } else {
      setMinStartInfo(null)
    }
  }, [excludedHoldings, tickerDates, categories, catHoldings])

  // 카테고리별 활성 종목 (제외 제거 + 비중 재분배)
  const getActiveHoldings = (catId) => {
    const all      = catHoldings[catId] || []
    const excluded = excludedHoldings[catId] || []
    const active   = all.filter(h => !excluded.includes(h.ticker))
    const totalW   = active.reduce((s, h) => s + h.weight, 0)
    return active.map(h => ({
      ...h,
      effectiveWeight: totalW > 0 ? h.weight / totalW : 1 / Math.max(active.length, 1),
    }))
  }

  const toggleExclude = (catId, ticker) => {
    setExcludedHoldings(prev => {
      const cur        = prev[catId] || []
      const isExcluded = cur.includes(ticker)
      return { ...prev, [catId]: isExcluded ? cur.filter(t => t !== ticker) : [...cur, ticker] }
    })
  }

  const handleRun = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const investAmt = parseFloat(initInvest.replace(/,/g, '')) || 10_000_000

      // 카테고리를 flat ticker 목록으로 펼치기 (제외 종목 반영 + 비중 재분배)
      const flatCats = []
      for (const cat of categories) {
        if (useActual[cat.id] && (catHoldings[cat.id]?.length ?? 0) > 0) {
          const actives = getActiveHoldings(cat.id)
          for (const h of actives) {
            flatCats.push({
              name:   `${cat.name}·${h.ticker}`,
              target: cat.target * h.effectiveWeight,
              ticker: h.ticker,
              color:  cat.color,
            })
          }
        } else {
          flatCats.push({
            name:   cat.name,
            target: cat.target,
            ticker: manualTicker[cat.id] || '',
            color:  cat.color,
          })
        }
      }

      const res = await runBacktest({
        categories:         flatCats,
        start_date:         `${startYear}-01-01`,
        end_date:           `${endYear}-12-31`,
        initial_investment: investAmt,
        rebal_frequency:    rebalFreq,
      })
      setResult(res)
    } catch (e) {
      setError(e.response?.data?.detail || '백테스팅 실패: 티커를 확인하세요')
    } finally {
      setLoading(false)
    }
  }

  const totalTarget = categories.reduce((s, c) => s + (c.target || 0), 0)
  const xTicks = result?.series.filter(s => s.date.endsWith('-01')).map(s => s.date) ?? []
  const stats = result?.stats

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700 }}>백테스팅</h2>
      <p style={{ margin: '0 0 24px', color: 'var(--muted)', fontSize: 13 }}>
        자산배분 템플릿의 목표비중으로 과거 수익률을 시뮬레이션합니다.
      </p>

      {/* ── Config ───────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '20px 24px', marginBottom: 24,
      }}>
        {/* 템플릿 선택 */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>템플릿</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {templates.map(t => (
              <button
                key={t.id}
                className={`btn btn-sm ${selectedTplId === t.id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSelectedTplId(t.id)}
              >
                {t.name}
              </button>
            ))}
            {templates.length === 0 && (
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                자산배분 페이지에서 템플릿을 먼저 만드세요
              </span>
            )}
          </div>
        </div>

        {/* 카테고리 목록 */}
        {categories.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 8,
            }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                카테고리별 종목 설정
              </label>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                한국 ETF: <code>069500.KS</code> · 현금: <code>CASH</code>
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {categories.map(cat => {
                const actuals  = catHoldings[cat.id] || []
                const isActual = useActual[cat.id] && actuals.length > 0
                return (
                  <div key={cat.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', background: 'var(--bg)',
                    borderRadius: 8, border: '1px solid var(--border)',
                    flexWrap: 'wrap',
                  }}>
                    {/* 색상 + 이름 + 비중 */}
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: cat.color, flexShrink: 0,
                    }} />
                    <span style={{ flex: '0 0 130px', fontWeight: 600, fontSize: 14 }}>
                      {cat.name}
                    </span>
                    <span style={{ flex: '0 0 42px', fontSize: 13, color: 'var(--muted)' }}>
                      {cat.target}%
                    </span>

                    {/* 실제 종목 사용 중 */}
                    {isActual ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                        {actuals.map(h => {
                          const isExcluded = (excludedHoldings[cat.id] || []).includes(h.ticker)
                          const activeList  = getActiveHoldings(cat.id)
                          const activeItem  = activeList.find(a => a.ticker === h.ticker)
                          const dispWeight  = isExcluded
                            ? h.weight           // 제외 시 원래 비중 표시
                            : activeItem?.effectiveWeight ?? h.weight   // 재분배된 비중
                          return (
                            <span
                              key={h.ticker}
                              title={isExcluded ? '클릭하여 포함' : '클릭하여 제외'}
                              onClick={() => toggleExclude(cat.id, h.ticker)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '3px 8px', borderRadius: 20, cursor: 'pointer',
                                background: isExcluded ? 'var(--bg)' : 'var(--surface)',
                                border: `1px solid ${isExcluded ? 'var(--border)' : 'var(--border)'}`,
                                fontSize: 12, fontWeight: 600,
                                opacity: isExcluded ? 0.4 : 1,
                                textDecoration: isExcluded ? 'line-through' : 'none',
                                userSelect: 'none',
                              }}
                            >
                              <span style={{ color: 'var(--text)' }}>{h.ticker}</span>
                              <span style={{ color: 'var(--muted)' }}>
                                {(dispWeight * 100).toFixed(0)}%
                              </span>
                            </span>
                          )
                        })}
                        <button
                          style={{
                            marginLeft: 4, fontSize: 11, color: 'var(--muted)',
                            background: 'none', border: 'none', cursor: 'pointer',
                            textDecoration: 'underline', padding: 0,
                          }}
                          onClick={() => setUseActual(prev => ({ ...prev, [cat.id]: false }))}
                        >
                          직접 입력
                        </button>
                      </div>
                    ) : (
                      /* 직접 입력 */
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                        <input
                          className="form-input"
                          style={{ flex: '0 0 160px', padding: '5px 10px', fontSize: 13 }}
                          placeholder="예: SPY, CASH"
                          value={manualTicker[cat.id] || ''}
                          onChange={e => setManualTicker(prev => ({ ...prev, [cat.id]: e.target.value }))}
                        />
                        {actuals.length > 0 && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setUseActual(prev => ({ ...prev, [cat.id]: true }))}
                          >
                            ↩ 실제 종목 사용
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {Math.abs(totalTarget - 100) > 0.5 && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#d97706' }}>
                ⚠ 목표비중 합계: {totalTarget}% (100%가 되도록 자산배분 페이지에서 조정하세요)
              </div>
            )}
          </div>
        )}

        {/* 파라미터 행 */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>시작 연도</label>
            <input
              className="form-input" style={{ width: 90, padding: '6px 10px' }}
              type="number"
              min={minStartInfo?.year ?? 2000}
              max={endYear}
              value={startYear}
              onChange={e => setStartYear(e.target.value)}
            />
            <div style={{ marginTop: 4, fontSize: 11, minHeight: 16 }}>
              {tickerInfoLoading && (
                <span style={{ color: 'var(--muted)' }}>시작일 조회 중…</span>
              )}
              {!tickerInfoLoading && minStartInfo && (
                <span style={{
                  color: parseInt(startYear) < minStartInfo.year ? '#d97706' : 'var(--muted)',
                }}>
                  최소 {minStartInfo.year}년
                  &nbsp;·&nbsp;
                  <span style={{ fontWeight: 600 }}>{minStartInfo.ticker}</span>
                  &nbsp;({minStartInfo.catName})
                </span>
              )}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>종료 연도</label>
            <input
              className="form-input" style={{ width: 90, padding: '6px 10px' }}
              type="number" min={startYear} max={CURRENT_YEAR}
              value={endYear} onChange={e => setEndYear(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>초기 투자금</label>
            <input
              className="form-input" style={{ width: 140, padding: '6px 10px' }}
              value={initInvest}
              onChange={e => {
                const raw = e.target.value.replace(/,/g, '')
                if (/^\d*$/.test(raw)) setInitInvest(Number(raw).toLocaleString())
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>리밸런싱</label>
            <select
              className="form-input" style={{ padding: '6px 10px' }}
              value={rebalFreq} onChange={e => setRebalFreq(e.target.value)}
            >
              <option value="monthly">매월</option>
              <option value="quarterly">분기별</option>
              <option value="annual">연간</option>
              <option value="none">없음</option>
            </select>
          </div>
          <button
            className="btn btn-primary"
            style={{ padding: '8px 24px', alignSelf: 'flex-end' }}
            onClick={handleRun}
            disabled={loading || categories.length === 0}
          >
            {loading ? '계산 중...' : '▶ 백테스팅 실행'}
          </button>
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8,
            background: '#fef2f2', border: '1px solid #fca5a5',
            color: '#dc2626', fontSize: 13,
          }}>
            {error}
          </div>
        )}
      </div>

      {/* ── Results ──────────────────────────────────────────────────── */}
      {stats && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <StatCard
              label="총 수익률"
              value={pct(stats.total_return)}
              color={stats.total_return >= 0 ? '#059669' : '#dc2626'}
              sub={`${won(stats.start_value)} → ${won(stats.end_value)}`}
            />
            <StatCard
              label="연 복리수익률 (CAGR)"
              value={pct(stats.cagr)}
              color={stats.cagr >= 0 ? '#059669' : '#dc2626'}
              sub={`${(stats.months / 12).toFixed(1)}년`}
            />
            <StatCard
              label="최대 낙폭 (MDD)"
              value={pct(stats.max_drawdown)}
              color="#dc2626"
            />
            <StatCard
              label="연 변동성"
              value={`${stats.volatility.toFixed(1)}%`}
            />
            <StatCard
              label="샤프 비율"
              value={stats.sharpe.toFixed(2)}
              color={stats.sharpe >= 1 ? '#059669' : stats.sharpe >= 0.5 ? '#d97706' : 'var(--text)'}
              sub="무위험수익률 0% 기준"
            />
          </div>

          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '20px 24px', marginBottom: 16,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 16 }}>포트폴리오 가치</div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={result.series} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date" ticks={xTicks} tickFormatter={v => v.slice(0, 4)}
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                />
                <YAxis
                  tickFormatter={v => {
                    if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(0)}억`
                    if (v >= 10_000) return `${(v / 10_000).toFixed(0)}만`
                    return v
                  }}
                  tick={{ fontSize: 11, fill: 'var(--muted)' }} width={56}
                />
                <Tooltip content={<ValueTooltip />} />
                <Line
                  type="monotone" dataKey="value"
                  stroke="#2563eb" strokeWidth={2}
                  dot={false} activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '20px 24px',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>낙폭 (Drawdown)</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>고점 대비 하락률</div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={result.series} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date" ticks={xTicks} tickFormatter={v => v.slice(0, 4)}
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                />
                <YAxis
                  tickFormatter={v => `${v.toFixed(0)}%`}
                  tick={{ fontSize: 11, fill: 'var(--muted)' }} width={48}
                />
                <Tooltip content={<DrawdownTooltip />} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Area
                  type="monotone" dataKey="drawdown"
                  stroke="#ef4444" fill="#ef4444" fillOpacity={0.15}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {!result && !loading && (
        <div style={{
          textAlign: 'center', padding: '60px 0',
          color: 'var(--muted)', fontSize: 14,
        }}>
          종목을 확인하고 백테스팅을 실행하세요
        </div>
      )}
    </div>
  )
}
