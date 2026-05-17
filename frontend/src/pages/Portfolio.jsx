import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useApp } from '../App'
import {
  getPortfolioTemplates, createPortfolioTemplate, updatePortfolioTemplate, deletePortfolioTemplate,
  getPortfolioCategories, createPortfolioCategory, updatePortfolioCategory, deletePortfolioCategory,
  getPortfolioAllocations, savePortfolioAllocations, recordRebalance,
  getHoldings, getISAHoldings, getShinhanISAHoldings,
  getCryptoHoldings, getSavings, getRealEstate,
  isRemoteReadonly,
} from '../api'

const won = n => Math.round(n).toLocaleString('ko-KR') + '원'

const PRESET_COLORS = [
  '#2563eb', '#059669', '#d97706', '#dc2626',
  '#7c3aed', '#0891b2', '#be185d', '#16a34a',
  '#ea580c', '#64748b',
]

const SOURCE_LABELS = {
  overseas:    '해외주식',
  isa:         '키움 ISA',
  shinhan_isa: '신한 ISA',
  crypto:      '코인',
  savings:     '적금',
  realestate:  '부동산',
}

// 각 소스별 평가금액 계산
function calcValue(sourceType, holding, fx) {
  switch (sourceType) {
    case 'overseas':    return (holding.shares || 0) * (holding.price || 0) * fx
    case 'isa':         return (holding.shares || 0) * (holding.price || 0)
    case 'shinhan_isa': return (holding.shares || 0) * (holding.price || 0)
    case 'crypto':      return holding.value || 0
    case 'savings':     return holding.balance || 0
    case 'realestate':  return Math.max((holding.current_value || 0) - (holding.debt || 0), 0)
    default:            return 0
  }
}

function getDisplayName(sourceType, h) {
  if (sourceType === 'overseas' || sourceType === 'isa' || sourceType === 'shinhan_isa')
    return { name: h.name || h.ticker || '', sub: h.ticker || '' }
  if (sourceType === 'crypto')
    return { name: h.currency || h.market || '', sub: h.market || '' }
  if (sourceType === 'savings')
    return { name: h.name || '', sub: h.bank || '' }
  if (sourceType === 'realestate')
    return { name: h.name || '', sub: h.type || '' }
  return { name: h.name || h.id, sub: '' }
}

// 커스텀 툴팁
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-modal)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
      <div style={{ color: d.payload.color, fontWeight: 600 }}>{d.payload.pct.toFixed(1)}%</div>
      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{won(d.value)}</div>
    </div>
  )
}

export default function Portfolio() {
  const { fx } = useApp()

  // ── templates ──
  const [templates, setTemplates]     = useState([])
  const [selectedId, setSelectedId]   = useState(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput]     = useState('')
  const [newTplName, setNewTplName]   = useState('')
  const [showTplInput, setShowTplInput] = useState(false)
  const [rebalDoing, setRebalDoing]   = useState(false)

  // ── categories ──
  const [categories, setCategories]     = useState([])
  const [newCatName, setNewCatName]     = useState('')
  const [newCatColor, setNewCatColor]   = useState(PRESET_COLORS[0])
  const [newCatTarget, setNewCatTarget] = useState('')
  const [editCat, setEditCat]           = useState(null) // { id, name, color, target }

  // ── holdings ──
  const [allHoldings, setAllHoldings] = useState({
    overseas: [], isa: [], shinhan_isa: [], crypto: [], savings: [], realestate: [],
  })

  // ── allocations: { "overseas:id" → categoryId } ──
  const [allocations, setAllocations] = useState({})
  const [dirty, setDirty]             = useState(false)
  const [saving, setSaving]           = useState(false)

  // ── load templates ──
  useEffect(() => {
    getPortfolioTemplates().then(data => {
      setTemplates(data)
      if (data.length > 0) setSelectedId(id => id ?? data[0].id)
    }).catch(() => {})
  }, [])

  // ── load all holdings once ──
  useEffect(() => {
    Promise.all([
      getHoldings().catch(() => []),
      getISAHoldings().catch(() => []),
      getShinhanISAHoldings().catch(() => []),
      getCryptoHoldings().catch(() => []),
      getSavings().catch(() => []),
      getRealEstate().catch(() => []),
    ]).then(([overseas, isa, shinhan, crypto, savings, re]) => {
      setAllHoldings({
        overseas,
        isa,
        shinhan_isa: shinhan,
        crypto,
        savings: savings.filter(s => s.status === 'active'),
        realestate: re.filter(r => r.status === 'active'),
      })
    })
  }, [])

  // ── load categories + allocations when template changes ──
  useEffect(() => {
    if (!selectedId) { setCategories([]); setAllocations({}); return }
    Promise.all([
      getPortfolioCategories(selectedId).catch(() => []),
      getPortfolioAllocations(selectedId).catch(() => []),
    ]).then(([cats, allocs]) => {
      setCategories(cats)
      const map = {}
      allocs.forEach(a => { map[`${a.source_type}:${a.source_id}`] = a.category_id })
      setAllocations(map)
      setDirty(false)
    })
  }, [selectedId])

  // ── 템플릿 ──
  const createTemplate = async () => {
    if (!newTplName.trim()) return
    try {
      const tpl = await createPortfolioTemplate({ name: newTplName.trim() })
      setTemplates(t => [...t, tpl])
      setSelectedId(tpl.id)
      setNewTplName('')
      setShowTplInput(false)
    } catch { alert('생성 실패') }
  }

  const saveName = async () => {
    if (!nameInput.trim()) return
    try {
      await updatePortfolioTemplate(selectedId, { name: nameInput.trim() })
      setTemplates(t => t.map(x => x.id === selectedId ? { ...x, name: nameInput.trim() } : x))
      setEditingName(false)
    } catch { alert('저장 실패') }
  }

  const removeTpl = async (id) => {
    if (!confirm('템플릿을 삭제하시겠습니까?')) return
    await deletePortfolioTemplate(id).catch(() => {})
    setTemplates(t => t.filter(x => x.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  // ── 카테고리 ──
  const addCategory = async () => {
    if (!newCatName.trim()) return
    try {
      const cat = await createPortfolioCategory(selectedId, {
        name: newCatName.trim(), color: newCatColor, order_idx: categories.length,
        target: parseFloat(newCatTarget) || 0,
      })
      setCategories(c => [...c, cat])
      setNewCatName('')
      setNewCatTarget('')
    } catch { alert('생성 실패') }
  }

  const doRebalance = async () => {
    if (!selectedId) return
    const today = new Date().toISOString().slice(0, 10)
    if (!confirm(`오늘(${today})을 리벨런싱 완료일로 기록하시겠습니까?`)) return
    setRebalDoing(true)
    try {
      const updated = await recordRebalance(selectedId, today)
      setTemplates(t => t.map(x => x.id === selectedId ? { ...x, last_rebal_date: updated.last_rebal_date } : x))
    } catch { alert('저장 실패') }
    setRebalDoing(false)
  }

  const saveEditCat = async () => {
    if (!editCat?.name.trim()) return
    try {
      await updatePortfolioCategory(editCat.id, { name: editCat.name, color: editCat.color, order_idx: editCat.order_idx ?? 0, target: editCat.target ?? 0 })
      setCategories(c => c.map(x => x.id === editCat.id ? { ...x, ...editCat } : x))
      setEditCat(null)
    } catch { alert('저장 실패') }
  }

  const removeCategory = async (catId) => {
    if (!confirm('카테고리를 삭제하시겠습니까?')) return
    await deletePortfolioCategory(catId).catch(() => {})
    setCategories(c => c.filter(x => x.id !== catId))
    setAllocations(a => {
      const next = { ...a }
      Object.keys(next).forEach(k => { if (next[k] === catId) delete next[k] })
      return next
    })
  }

  // ── 분류 변경/저장 ──
  const setAlloc = (key, catId) => {
    setAllocations(a => {
      const next = { ...a }
      if (catId) next[key] = catId
      else delete next[key]
      return next
    })
    setDirty(true)
  }

  const saveAllocs = async () => {
    setSaving(true)
    try {
      const body = Object.entries(allocations).map(([key, catId]) => {
        const [sourceType, ...rest] = key.split(':')
        return { category_id: catId, source_type: sourceType, source_id: rest.join(':') }
      })
      await savePortfolioAllocations(selectedId, body)
      setDirty(false)
    } catch { alert('저장 실패') }
    setSaving(false)
  }

  // ── 집계 ──
  const SOURCE_ORDER = ['overseas', 'isa', 'shinhan_isa', 'crypto', 'savings', 'realestate']

  const flatHoldings = SOURCE_ORDER.flatMap(src =>
    (allHoldings[src] || []).map(h => ({
      src, id: h.id, key: `${src}:${h.id}`,
      value: calcValue(src, h, fx),
      ...getDisplayName(src, h),
    }))
  ).filter(h => h.value > 0) // 평가금액 0은 제외

  const grandTotal = flatHoldings.reduce((s, h) => s + h.value, 0)

  const catTotals = {}
  categories.forEach(c => { catTotals[c.id] = 0 })
  flatHoldings.forEach(h => {
    const catId = allocations[h.key]
    if (catId && catTotals[catId] !== undefined) catTotals[catId] += h.value
  })

  const allocatedTotal = Object.values(catTotals).reduce((s, v) => s + v, 0)
  const unallocatedTotal = grandTotal - allocatedTotal

  // ── 리벨런싱 상태 계산 ──
  const selectedTplObj = templates.find(t => t.id === selectedId)
  const rebalInterval  = selectedTplObj?.rebal_interval_months ?? 6
  const deviationThreshold = selectedTplObj?.deviation_threshold ?? 5.0
  const lastRebalDate  = selectedTplObj?.last_rebal_date || ''

  const nextRebalDate = (() => {
    if (!lastRebalDate) return null
    const d = new Date(lastRebalDate)
    d.setMonth(d.getMonth() + rebalInterval)
    return d
  })()
  const today = new Date(); today.setHours(0,0,0,0)
  const daysUntilRebal = nextRebalDate ? Math.round((nextRebalDate - today) / 86400000) : null
  const timeOverdue = daysUntilRebal !== null && daysUntilRebal <= 0

  const deviatingCats = categories.filter(c => {
    if (!c.target) return false
    const actual = allocatedTotal > 0 ? (catTotals[c.id] / allocatedTotal) * 100 : 0
    return Math.abs(actual - c.target) > deviationThreshold
  })
  const needsRebal = timeOverdue || deviatingCats.length > 0

  // recharts 데이터 — % 기준: 선택된 자산 합계(allocatedTotal)
  const pieData = categories
    .filter(c => catTotals[c.id] > 0)
    .map(c => ({
      name: c.name, value: catTotals[c.id], color: c.color,
      pct: allocatedTotal > 0 ? (catTotals[c.id] / allocatedTotal) * 100 : 0,
    }))

  const selectedTpl = selectedTplObj

  // 소스별 그룹
  const bySource = SOURCE_ORDER
    .map(src => ({ src, items: flatHoldings.filter(h => h.src === src) }))
    .filter(g => g.items.length > 0)

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h2>자산배분 템플릿</h2>
          <p>보유 종목을 원하는 기준으로 묶어 비중을 확인하세요</p>
        </div>
      </div>

      {/* ── 템플릿 탭 바 ── */}
      <div className="pf-tpl-bar">
        {templates.map(t => (
          <div
            key={t.id}
            className={`pf-tpl-tab${selectedId === t.id ? ' active' : ''}`}
            onClick={() => { setSelectedId(t.id); setEditingName(false) }}
          >
            {t.name}
            {!isRemoteReadonly && selectedId === t.id && (
              <span
                className="pf-tpl-tab-del"
                title="삭제"
                onClick={e => { e.stopPropagation(); removeTpl(t.id) }}
              >×</span>
            )}
          </div>
        ))}
        {!isRemoteReadonly && (
          showTplInput ? (
            <div className="pf-tpl-input-row">
              <input
                className="form-input"
                value={newTplName}
                onChange={e => setNewTplName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createTemplate(); if (e.key === 'Escape') setShowTplInput(false) }}
                placeholder="템플릿 이름"
                autoFocus
                style={{ width: 160, padding: '4px 10px', fontSize: 13 }}
              />
              <button className="btn btn-primary btn-sm" onClick={createTemplate}>추가</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowTplInput(false)}>취소</button>
            </div>
          ) : (
            <button className="btn btn-ghost btn-sm pf-tpl-add" onClick={() => setShowTplInput(true)}>+ 새 템플릿</button>
          )
        )}
      </div>

      {/* ── 템플릿 미선택 ── */}
      {!selectedId ? (
        <div className="empty" style={{ marginTop: 60 }}>
          <div className="empty-icon">🎯</div>
          <p>템플릿을 선택하거나 새로 만드세요</p>
          <p className="small txt-m" style={{ marginTop: 6 }}>
            주식·채권·현금 등 원하는 기준으로 종목을 묶어 비중을 볼 수 있습니다
          </p>
        </div>
      ) : (
        <>
          {/* ── 템플릿 이름 편집 ── */}
          {editingName ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
              <input
                className="form-input"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                autoFocus
                style={{ width: 220 }}
              />
              <button className="btn btn-primary btn-sm" onClick={saveName}>저장</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingName(false)}>취소</button>
            </div>
          ) : (
            !isRemoteReadonly && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginBottom: 20 }}
                onClick={() => { setNameInput(selectedTpl?.name || ''); setEditingName(true) }}
              >✏️ 이름 수정</button>
            )
          )}

          {/* ── 리벨런싱 알림 배너 ── */}
          {selectedId && (needsRebal || daysUntilRebal !== null) && (
            <div className={`rebal-banner${needsRebal ? ' rebal-banner-warn' : ' rebal-banner-ok'}`}>
              <div className="rebal-banner-left">
                <span className="rebal-banner-icon">{needsRebal ? '⚠️' : '✅'}</span>
                <div>
                  <div className="rebal-banner-title">
                    {needsRebal ? '리벨런싱 필요' : '정상 유지 중'}
                  </div>
                  <div className="rebal-banner-detail">
                    {timeOverdue && <span>기간 도래 ({lastRebalDate ? `마지막: ${lastRebalDate}` : '기록 없음'}, {rebalInterval}개월 주기)</span>}
                    {!needsRebal && daysUntilRebal !== null && (
                      <span>다음 리벨런싱까지 {daysUntilRebal}일 ({nextRebalDate?.toLocaleDateString('ko-KR')})</span>
                    )}
                    {!needsRebal && daysUntilRebal === null && <span>리벨런싱 이력 없음 — 완료 후 날짜를 기록하세요</span>}
                  </div>
                  {deviatingCats.length > 0 && (
                    <div className="rebal-cat-table">
                      {deviatingCats.map(c => {
                        const actual   = allocatedTotal > 0 ? (catTotals[c.id] / allocatedTotal) * 100 : 0
                        const diffPct  = actual - c.target
                        const diffAmt  = catTotals[c.id] - (c.target / 100) * allocatedTotal
                        const isSell   = diffAmt > 0
                        return (
                          <div key={c.id} className="rebal-cat-row">
                            <span className="rebal-cat-dot" style={{ background: c.color }} />
                            <span className="rebal-cat-name">{c.name}</span>
                            <span className="rebal-cat-pct" style={{ color: isSell ? '#dc2626' : '#2563eb' }}>
                              {diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%p
                            </span>
                            <span className={`rebal-cat-badge ${isSell ? 'rebal-badge-sell' : 'rebal-badge-buy'}`}>
                              {isSell ? '매도' : '매수'}
                            </span>
                            <span className="rebal-cat-amt">
                              {Math.abs(diffAmt) >= 1e8
                                ? `${(Math.abs(diffAmt) / 1e8).toFixed(2)}억원`
                                : `${Math.round(Math.abs(diffAmt) / 1e4).toLocaleString()}만원`}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
              {!isRemoteReadonly && (
                <button className="btn btn-primary btn-sm" onClick={doRebalance} disabled={rebalDoing}>
                  {rebalDoing ? '저장 중...' : '리벨런싱 완료'}
                </button>
              )}
            </div>
          )}

          {/* ── 파이 차트 + 카테고리 목록 ── */}
          {pieData.length > 0 && (
            <div className="section">
              <div className="pf-summary-wrap">
                {/* 파이 차트 */}
                <div className="pf-pie-wrap">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={110}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((d, i) => (
                          <Cell key={i} fill={d.color} stroke="var(--surface)" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pf-pie-center">
                    <div className="pf-pie-total-label">선택 자산</div>
                    <div className="pf-pie-total-value">{won(allocatedTotal)}</div>
                  </div>
                </div>

                {/* 카테고리 비중 목록 — 실제 vs 목표 */}
                <div className="pf-cat-summary">
                  {categories.filter(c => catTotals[c.id] > 0 || c.target > 0).map(c => {
                    const actual = allocatedTotal > 0 ? (catTotals[c.id] / allocatedTotal) * 100 : 0
                    const diff   = c.target ? actual - c.target : null
                    const absDiff = diff !== null ? Math.abs(diff) : 0
                    const diffColor = absDiff > deviationThreshold ? '#dc2626' : absDiff > deviationThreshold / 2 ? '#d97706' : 'var(--muted)'
                    return (
                      <div key={c.id} className="pf-cat-summary-row">
                        <div className="pf-cat-dot" style={{ background: c.color }} />
                        <div className="pf-cat-summary-name">{c.name}</div>
                        <div className="pf-cat-summary-bar-wrap">
                          <div className="pf-cat-summary-bar-track">
                            <div
                              className="pf-cat-summary-bar-fill"
                              style={{ width: `${actual}%`, background: c.color }}
                            />
                            {c.target > 0 && (
                              <div className="pf-cat-target-marker" style={{ left: `${c.target}%` }} />
                            )}
                          </div>
                          <span className="pf-cat-pct-label">{actual.toFixed(1)}%</span>
                          {c.target > 0 && (
                            <span style={{ fontSize: 11, color: diffColor, minWidth: 52, textAlign: 'right' }}>
                              목표{c.target}% {diff !== null ? `(${diff > 0 ? '+' : ''}${diff.toFixed(1)}%p)` : ''}
                            </span>
                          )}
                        </div>
                        <div className="pf-cat-summary-val">{won(catTotals[c.id])}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── 리벨런싱 설정 ── */}
          {!isRemoteReadonly && selectedTpl && (
            <div className="section">
              <div className="section-header">
                <div className="section-title">리벨런싱 설정</div>
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                  주기
                  <select
                    className="form-input"
                    style={{ width: 120 }}
                    value={selectedTpl.rebal_interval_months ?? 6}
                    onChange={async e => {
                      const val = parseInt(e.target.value)
                      await updatePortfolioTemplate(selectedId, { ...selectedTpl, rebal_interval_months: val }).catch(() => {})
                      setTemplates(t => t.map(x => x.id === selectedId ? { ...x, rebal_interval_months: val } : x))
                    }}
                  >
                    <option value={1}>1개월</option>
                    <option value={3}>3개월</option>
                    <option value={6}>6개월</option>
                    <option value={12}>12개월</option>
                  </select>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                  비중 이탈 기준
                  <select
                    className="form-input"
                    style={{ width: 100 }}
                    value={selectedTpl.deviation_threshold ?? 5}
                    onChange={async e => {
                      const val = parseFloat(e.target.value)
                      await updatePortfolioTemplate(selectedId, { ...selectedTpl, deviation_threshold: val }).catch(() => {})
                      setTemplates(t => t.map(x => x.id === selectedId ? { ...x, deviation_threshold: val } : x))
                    }}
                  >
                    <option value={3}>3%</option>
                    <option value={5}>5%</option>
                    <option value={10}>10%</option>
                  </select>
                </label>
                {lastRebalDate && (
                  <span className="small txt-m">마지막 리벨런싱: {lastRebalDate}</span>
                )}
              </div>
            </div>
          )}

          {/* ── 카테고리 관리 ── */}
          <div className="section">
            <div className="section-header">
              <div className="section-title">카테고리 설정 <span className="small txt-m" style={{ fontWeight: 400 }}>(목표비중 설정 가능)</span></div>
            </div>
            <div className="pf-cat-editor">
              {/* 기존 카테고리 목록 */}
              {categories.length > 0 && (
                <div className="pf-cat-list">
                  {categories.map(cat => (
                    editCat?.id === cat.id ? (
                      <div key={cat.id} className="pf-cat-edit-row">
                        <div className="pf-color-picker">
                          {PRESET_COLORS.map(c => (
                            <div
                              key={c}
                              className={`pf-color-swatch${editCat.color === c ? ' selected' : ''}`}
                              style={{ background: c }}
                              onClick={() => setEditCat(e => ({ ...e, color: c }))}
                            />
                          ))}
                        </div>
                        <input
                          className="form-input"
                          value={editCat.name}
                          onChange={e => setEditCat(x => ({ ...x, name: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') saveEditCat(); if (e.key === 'Escape') setEditCat(null) }}
                          style={{ flex: 1 }}
                          autoFocus
                        />
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          max="100"
                          value={editCat.target ?? ''}
                          onChange={e => setEditCat(x => ({ ...x, target: parseFloat(e.target.value) || 0 }))}
                          placeholder="목표%"
                          style={{ width: 80 }}
                        />
                        <button className="btn btn-primary btn-sm" onClick={saveEditCat}>저장</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditCat(null)}>취소</button>
                      </div>
                    ) : (
                      <div key={cat.id} className="pf-cat-row">
                        <div className="pf-cat-color-dot" style={{ background: cat.color }} />
                        <span className="fw6">{cat.name}</span>
                        <span className="txt-m small" style={{ marginLeft: 8 }}>
                          {allocatedTotal > 0 ? `${((catTotals[cat.id] / allocatedTotal) * 100).toFixed(1)}%` : '—'}
                          {cat.target > 0 && <span style={{ color: 'var(--muted)' }}> / 목표 {cat.target}%</span>}
                          &nbsp;({won(catTotals[cat.id])})
                        </span>
                        {!isRemoteReadonly && (
                          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setEditCat({ ...cat })}
                            >수정</button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => removeCategory(cat.id)}
                            >삭제</button>
                          </div>
                        )}
                      </div>
                    )
                  ))}
                </div>
              )}

              {/* 새 카테고리 추가 */}
              {!isRemoteReadonly && (
                <div className="pf-cat-add-row">
                  <div className="pf-color-picker">
                    {PRESET_COLORS.map(c => (
                      <div
                        key={c}
                        className={`pf-color-swatch${newCatColor === c ? ' selected' : ''}`}
                        style={{ background: c }}
                        onClick={() => setNewCatColor(c)}
                      />
                    ))}
                  </div>
                  <input
                    className="form-input"
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCategory()}
                    placeholder="새 카테고리 (예: 주식, 채권, 현금성자산)"
                    style={{ flex: 1 }}
                  />
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    max="100"
                    value={newCatTarget}
                    onChange={e => setNewCatTarget(e.target.value)}
                    placeholder="목표%"
                    style={{ width: 80 }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={addCategory}>추가</button>
                </div>
              )}
            </div>
          </div>

          {/* ── 종목 분류 테이블 ── */}
          <div className="section">
            <div className="section-header">
              <div className="section-title">종목 분류</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {!isRemoteReadonly && dirty && (
                  <button className="btn btn-primary btn-sm" onClick={saveAllocs} disabled={saving}>
                    {saving ? '저장 중...' : '💾 저장'}
                  </button>
                )}
              </div>
            </div>

            {categories.length === 0 ? (
              <p className="txt-m small">먼저 위에서 카테고리를 추가해주세요.</p>
            ) : bySource.length === 0 ? (
              <p className="txt-m small">보유 자산이 없습니다.</p>
            ) : (
              <>
                {bySource.map(({ src, items }) => (
                  <div key={src} className="pf-source-group">
                    <div className="pf-source-label">
                      <span className="badge badge-blue">{SOURCE_LABELS[src]}</span>
                      <span className="small txt-m" style={{ marginLeft: 8 }}>
                        {won(items.reduce((s, h) => s + h.value, 0))}
                      </span>
                    </div>
                    <div className="table-wrap" style={{ marginBottom: 0 }}>
                      <table>
                        <thead><tr>
                          <th>종목명</th>
                          <th className="num">평가금액</th>
                          <th style={{ width: 200 }}>카테고리</th>
                        </tr></thead>
                        <tbody>
                          {items.map(h => (
                            <tr key={h.key}>
                              <td>
                                <div className="fw6">{h.name}</div>
                                {h.sub && h.sub !== h.name && (
                                  <div className="small txt-m">{h.sub}</div>
                                )}
                              </td>
                              <td className="num">{won(h.value)}</td>
                              <td>
                                <select
                                  className="form-input pf-alloc-select"
                                  value={allocations[h.key] || ''}
                                  onChange={e => setAlloc(h.key, e.target.value)}
                                >
                                  <option value="">— 미분류 —</option>
                                  {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                {!isRemoteReadonly && dirty && (
                  <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary" onClick={saveAllocs} disabled={saving}>
                      {saving ? '저장 중...' : '💾 분류 저장'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
