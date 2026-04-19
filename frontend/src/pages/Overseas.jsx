import { useEffect, useState, useCallback } from 'react'
import { useApp } from '../App'
import Modal, { FormGroup, FormRow } from '../components/Modal'
import {
  getHoldings, createHolding, updateHolding, deleteHolding,
  getRebalHistory, createRebal, deleteRebal,
  fetchFxRate, fetchStockPrice, fetchStockPrices, isRemoteReadonly, updateHolding as updateH,
} from '../api'

const usd = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const won = n => Math.round(n).toLocaleString('ko-KR') + '원'
const fmt = n => Number(n).toFixed(2)

const OWNERS = [
  { id: 'me', label: '김세현' },
  { id: 'spouse', label: '김다인' },
]
const ownerLabel = owner => OWNERS.find(o => o.id === owner)?.label || '김세현'
const BLANK_H = { owner: 'me', ticker: '', name: '', shares: '', price: '', target: '', note: '' }
const BLANK_R = { date: new Date().toISOString().slice(0, 10), note: '' }

export default function Overseas() {
  const { fx, setFx } = useApp()
  const [holdings, setHoldings] = useState([])
  const [history, setHistory]   = useState([])
  const [holdModal, setHoldModal] = useState(false)
  const [rebalModal, setRebalModal] = useState(false)
  const [form, setForm]       = useState(BLANK_H)
  const [rebalForm, setRebalForm] = useState(BLANK_R)
  const [editId, setEditId]   = useState(null)
  const [fxInput, setFxInput]     = useState(fx)
  const [fxDate, setFxDate]       = useState(null)
  const [fxLoading, setFxLoading] = useState(false)
  const [priceLoading, setPriceLoading] = useState(false)  // 일괄 조회
  const [tickerLoading, setTickerLoading] = useState(false) // 모달 단일 조회
  const [lastUpdated, setLastUpdated] = useState(null)
  const [ownerFilter, setOwnerFilter] = useState('me')

  const load = useCallback(() => {
    getHoldings().then(setHoldings).catch(() => {})
    getRebalHistory().then(setHistory).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setFxInput(fx) }, [fx])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const visibleHoldings = holdings.filter(h => (h.owner || 'me') === ownerFilter)

  // 모달: 티커 입력 후 가격+이름 자동 조회
  const handleTickerLookup = async () => {
    if (!form.ticker.trim()) return
    setTickerLoading(true)
    try {
      const data = await fetchStockPrice(form.ticker.trim())
      setForm(f => ({
        ...f,
        ticker: data.ticker,
        price: data.price,
        name: f.name || data.name,  // 이미 입력된 이름이 있으면 유지
      }))
    } catch (e) {
      alert(e.response?.data?.detail || '조회 실패 — 티커를 확인하세요')
    } finally {
      setTickerLoading(false)
    }
  }

  // 전체 보유 종목 가격 일괄 업데이트
  const handleBulkPriceUpdate = async () => {
    if (!visibleHoldings.length) return
    setPriceLoading(true)
    try {
      const tickers = visibleHoldings.map(h => h.ticker)
      const prices  = await fetchStockPrices(tickers)
      // 각 종목 가격 업데이트
      await Promise.all(
        visibleHoldings
          .filter(h => prices[h.ticker] != null)
          .map(h => updateHolding(h.id, { ...h, price: prices[h.ticker] }))
      )
      setLastUpdated(new Date().toLocaleTimeString('ko-KR'))
      load()
    } catch {
      alert('가격 일괄 조회 실패 — 백엔드 서버를 확인하세요')
    } finally {
      setPriceLoading(false)
    }
  }

  const totalUsd = visibleHoldings.reduce((s, h) => s + h.shares * h.price, 0)
  const householdUsd = holdings.reduce((s, h) => s + h.shares * h.price, 0)
  const tgtSum   = visibleHoldings.reduce((s, h) => s + h.target, 0)

  const needsRebal = visibleHoldings.filter(h => {
    if (!totalUsd) return false
    return Math.abs(h.shares * h.price / totalUsd * 100 - h.target) > 4
  })

  const openAdd  = () => { setForm({ ...BLANK_H, owner: ownerFilter }); setEditId(null); setHoldModal(true) }
  const openEdit = (h) => {
    setForm({ ...h, shares: h.shares || '', price: h.price || '', target: h.target || '' })
    setEditId(h.id); setHoldModal(true)
  }

  const submitHolding = async () => {
    if (!form.ticker.trim()) { alert('티커를 입력하세요'); return }
    const body = { ...form, owner: form.owner || ownerFilter, ticker: form.ticker.toUpperCase(), shares: +form.shares || 0, price: +form.price || 0, target: +form.target || 0 }
    try {
      if (editId) await updateHolding(editId, body)
      else await createHolding(body)
      setHoldModal(false); load()
    } catch { alert('저장 실패') }
  }

  const removeHolding = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    await deleteHolding(id); load()
  }

  const submitRebal = async () => {
    if (!rebalForm.note.trim()) { alert('내용을 입력하세요'); return }
    try { await createRebal(rebalForm); setRebalModal(false); load() }
    catch { alert('저장 실패') }
  }

  const removeRebal = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    await deleteRebal(id); load()
  }

  const handleFxSave = () => { const v = +fxInput; if (v) setFx(v) }

  const handleFxFetch = async () => {
    setFxLoading(true)
    try {
      const data = await fetchFxRate()
      setFxInput(data.krw)
      setFxDate(data.date)
      setFx(data.krw)
    } catch (e) {
      alert(e.response?.data?.detail || '환율 조회 실패 — 인터넷 연결을 확인하세요')
    } finally {
      setFxLoading(false)
    }
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <div><h2>해외직투</h2><p>포트폴리오 관리 · 리밸런싱 모니터링</p></div>
        <div className="page-header-actions">
          {OWNERS.map(owner => (
            <button
              key={owner.id}
              className={`btn ${ownerFilter === owner.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setOwnerFilter(owner.id)}
            >
              {owner.label}
            </button>
          ))}
          {!isRemoteReadonly && (
            <>
              <button className="btn btn-ghost" onClick={() => { setRebalForm(BLANK_R); setRebalModal(true) }}>리밸런싱 기록</button>
              <button
                className="btn btn-ghost"
                onClick={handleBulkPriceUpdate}
                disabled={priceLoading || !visibleHoldings.length}
                title="Yahoo Finance에서 모든 종목 현재가를 가져옵니다"
              >
                {priceLoading ? '조회 중...' : '📈 가격 일괄 업데이트'}
              </button>
              <button className="btn btn-primary" onClick={openAdd}>+ 종목 추가</button>
            </>
          )}
        </div>
      </div>

      {needsRebal.length > 0 ? (
        <div className="alert alert-danger">
          <span>⚠️</span>
          <span>
            <strong>리밸런싱 필요</strong> —{' '}
            {needsRebal.map((h, i) => <span key={h.id}><strong>{h.ticker}</strong>{i < needsRebal.length - 1 ? ', ' : ''}</span>)}{' '}
            종목이 목표 비중에서 4% 이상 이탈했습니다.
          </span>
        </div>
      ) : visibleHoldings.length > 0 ? (
        <div className="alert alert-success">✓ 모든 종목이 목표 비중 ±4% 이내에 있습니다.</div>
      ) : null}

      <div className="fx-bar">
        <div className="fx-dot" />
        <span>USD/KRW</span>
        <input
          type="number"
          value={fxInput}
          onChange={e => setFxInput(e.target.value)}
          onBlur={handleFxSave}
          onKeyDown={e => e.key === 'Enter' && handleFxSave()}
        />
        <span>원</span>
        {fxDate && (
          <span style={{ fontSize: 11, color: 'var(--success)' }}>
            기준일 {fxDate}
          </span>
        )}
        {lastUpdated && (
          <span style={{ fontSize: 11, color: 'var(--success)' }}>
            가격 업데이트 {lastUpdated}
          </span>
        )}
        {!isRemoteReadonly && <button
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={handleFxFetch}
          disabled={fxLoading}
        >
          {fxLoading ? '조회 중...' : '🔄 환율 자동 조회'}
        </button>}
      </div>

      <div className="grid-3">
        <div className="stat-card accent-blue">
          <div className="stat-label">포트폴리오 (USD)</div>
          <div className="stat-value">{usd(totalUsd)}</div>
          <div className="stat-sub">{ownerLabel(ownerFilter)} · {visibleHoldings.length}개 종목</div>
        </div>
        <div className="stat-card accent-green">
          <div className="stat-label">포트폴리오 (KRW)</div>
          <div className="stat-value">{won(totalUsd * fx)}</div>
          <div className="stat-sub">환율 {fx.toLocaleString()}원 기준</div>
        </div>
        <div className={`stat-card ${Math.abs(tgtSum - 100) < 0.1 ? 'accent-green' : 'accent-orange'}`}>
          <div className="stat-label">목표 비중 합계</div>
          <div className={`stat-value ${Math.abs(tgtSum - 100) < 0.1 ? 'txt-s' : 'txt-w'}`}>{fmt(tgtSum)}%</div>
          <div className="stat-sub">{Math.abs(tgtSum - 100) < 0.1 ? '합계 정상 (100%)' : '합계가 100%가 아닙니다'}</div>
        </div>
        <div className="stat-card accent-gray">
          <div className="stat-label">가구 합산 (KRW)</div>
          <div className="stat-value">{won(householdUsd * fx)}</div>
          <div className="stat-sub">대시보드/연간기록 반영 금액</div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <div className="section-title">포트폴리오 현황</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>티커</th><th>종목명</th>
              <th className="num">수량</th><th className="num">현재가</th>
              <th className="num">평가액 (USD)</th><th className="num">평가액 (KRW)</th>
              <th className="num">목표%</th><th className="num">현재%</th>
              <th>차이</th><th>상태</th><th></th>
            </tr></thead>
            <tbody>
              {visibleHoldings.length === 0 ? (
                <tr><td colSpan={11}>
                  <div className="empty"><div className="empty-icon">🌐</div><p>{ownerLabel(ownerFilter)} 해외직투 종목이 없습니다</p></div>
                </td></tr>
              ) : visibleHoldings.map(h => {
                const val     = h.shares * h.price
                const curPct  = totalUsd > 0 ? val / totalUsd * 100 : 0
                const diff    = curPct - h.target
                const absDiff = Math.abs(diff)
                const diffColor = absDiff > 4 ? 'txt-d' : absDiff > 2 ? 'txt-w' : 'txt-s'
                const barColor  = absDiff > 4 ? 'var(--danger)' : absDiff > 2 ? 'var(--warning)' : 'var(--success)'
                const fillW = Math.min(curPct / Math.max(h.target * 1.5, 1) * 100, 100)

                return (
                  <tr key={h.id}>
                    <td><strong>{h.ticker}</strong></td>
                    <td>
                      <div>{h.name || '—'}</div>
                      {h.note && <div className="small txt-m">{h.note}</div>}
                    </td>
                    <td className="num">{h.shares}</td>
                    <td className="num">{usd(h.price)}</td>
                    <td className="num fw7">{usd(val)}</td>
                    <td className="num">{won(val * fx)}</td>
                    <td className="num txt-m">{fmt(h.target)}%</td>
                    <td className="num">{fmt(curPct)}%</td>
                    <td>
                      <div className="alloc-row">
                        <span className={`fw7 ${diffColor}`} style={{ fontSize: 13, minWidth: 52 }}>
                          {diff >= 0 ? '+' : ''}{fmt(diff)}%
                        </span>
                        <div className="alloc-bar">
                          <div className="alloc-fill" style={{ width: `${fillW}%`, background: barColor }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      {absDiff > 4
                        ? <span className="badge badge-red">리밸런싱 필요</span>
                        : <span className="badge badge-green">정상</span>}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(h)}>수정</button>
                        <button className="btn btn-danger btn-sm" onClick={() => removeHolding(h.id)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {needsRebal.length > 0 && (
          <div className="card card-danger" style={{ marginTop: 14 }}>
            <div className="section-header">
              <div className="section-title txt-d">리밸런싱 조치 가이드</div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>티커</th><th className="num">현재가</th>
                  <th className="num">거래 금액 (USD)</th>
                  <th className="num">거래 수량 (주)</th>
                  <th>액션</th>
                </tr></thead>
                <tbody>
                  {needsRebal.map(h => {
                    const ideal      = h.target / 100 * totalUsd
                    const tradeUsd   = ideal - h.shares * h.price
                    const tradeShares= h.price > 0 ? tradeUsd / h.price : 0
                    return (
                      <tr key={h.id}>
                        <td><strong>{h.ticker}</strong></td>
                        <td className="num">{usd(h.price)}</td>
                        <td className={`num fw7 ${tradeUsd >= 0 ? 'txt-s' : 'txt-d'}`}>
                          {tradeUsd >= 0 ? '+' : ''}{usd(Math.abs(tradeUsd))}
                        </td>
                        <td className={`num ${tradeShares >= 0 ? 'txt-s' : 'txt-d'}`}>
                          {tradeShares >= 0 ? '+' : ''}{tradeShares.toFixed(3)}주
                        </td>
                        <td>
                          <span className={`badge ${tradeUsd >= 0 ? 'badge-green' : 'badge-red'}`}>
                            {tradeUsd >= 0 ? '매수' : '매도'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="small txt-m" style={{ marginTop: 12 }}>
              ※ 목표 비중 복원을 위한 이론적 거래량입니다. 실제 거래 시 수수료·세금을 고려하세요.
            </p>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-header"><div className="section-title">리밸런싱 이력</div></div>
        {history.length === 0 ? (
          <div className="empty" style={{ padding: '24px 0' }}><p>리밸런싱 이력이 없습니다</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>날짜</th><th>내용</th><th></th></tr></thead>
              <tbody>
                {history.map(r => (
                  <tr key={r.id}>
                    <td className="txt-m" style={{ whiteSpace: 'nowrap', width: 120 }}>{r.date}</td>
                    <td>{r.note || '—'}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => removeRebal(r.id)}>삭제</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 종목 모달 */}
      <Modal open={holdModal} onClose={() => setHoldModal(false)} title={editId ? '종목 수정' : '종목 추가'}>
        <FormGroup label="소유자">
          <select className="form-input" value={form.owner || ownerFilter} onChange={e => set('owner', e.target.value)}>
            {OWNERS.map(owner => <option key={owner.id} value={owner.id}>{owner.label}</option>)}
          </select>
        </FormGroup>
        <FormGroup label="티커 (심볼)">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              value={form.ticker}
              onChange={e => set('ticker', e.target.value.toUpperCase())}
              placeholder="예) SPY"
              onKeyDown={e => e.key === 'Enter' && handleTickerLookup()}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleTickerLookup}
              disabled={tickerLoading || !form.ticker.trim()}
              style={{ whiteSpace: 'nowrap' }}
            >
              {tickerLoading ? '조회 중...' : '🔍 가격 조회'}
            </button>
          </div>
        </FormGroup>
        <FormGroup label="종목명">
          <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="조회 버튼 클릭 시 자동 입력" />
        </FormGroup>
        <FormRow>
          <FormGroup label="보유 수량">
            <input className="form-input" type="number" step="0.001" value={form.shares} onChange={e => set('shares', e.target.value)} placeholder="0" />
          </FormGroup>
          <FormGroup label="현재가 (USD)">
            <input className="form-input" type="number" step="0.01" value={form.price} onChange={e => set('price', e.target.value)} placeholder="조회 시 자동 입력" />
          </FormGroup>
        </FormRow>
        <FormGroup label="목표 비중 (%)">
          <input className="form-input" type="number" step="0.1" value={form.target} onChange={e => set('target', e.target.value)} placeholder="예) 30" />
        </FormGroup>
        <FormGroup label="메모">
          <input className="form-input" value={form.note} onChange={e => set('note', e.target.value)} placeholder="선택 입력" />
        </FormGroup>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setHoldModal(false)}>취소</button>
          <button className="btn btn-primary" onClick={submitHolding}>저장</button>
        </div>
      </Modal>

      {/* 리밸런싱 기록 모달 */}
      <Modal open={rebalModal} onClose={() => setRebalModal(false)} title="리밸런싱 기록">
        <FormGroup label="날짜">
          <input className="form-input" type="date" value={rebalForm.date} onChange={e => setRebalForm(f => ({ ...f, date: e.target.value }))} />
        </FormGroup>
        <FormGroup label="내용">
          <textarea className="form-input" rows={3} value={rebalForm.note}
            onChange={e => setRebalForm(f => ({ ...f, note: e.target.value }))}
            placeholder="리밸런싱 내용을 입력하세요" style={{ resize: 'vertical' }} />
        </FormGroup>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setRebalModal(false)}>취소</button>
          <button className="btn btn-primary" onClick={submitRebal}>저장</button>
        </div>
      </Modal>
    </div>
  )
}
