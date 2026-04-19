import { useEffect, useMemo, useState } from 'react'
import Modal, { FormGroup, FormRow } from '../components/Modal'
import {
  getISA, createISA, deleteISA,
  getISAHoldings, createISAHolding, updateISAHolding, deleteISAHolding,
  fetchStockPrice, fetchStockPrices, isRemoteReadonly, syncISAFromKiwoom,
} from '../api'

const won = n => Math.round(Number(n) || 0).toLocaleString('ko-KR') + '원'
const today = () => new Date().toISOString().slice(0, 10)
const BLANK_HOLDING = { ticker: '', name: '', shares: '', price: '', note: '' }

export default function ISA() {
  const [list, setList] = useState([])
  const [holdings, setHoldings] = useState([])
  const [balanceModal, setBalanceModal] = useState(false)
  const [holdingModal, setHoldingModal] = useState(false)
  const [form, setForm] = useState({ date: today(), value: '', note: '' })
  const [holdingForm, setHoldingForm] = useState(BLANK_HOLDING)
  const [editId, setEditId] = useState(null)
  const [priceLoading, setPriceLoading] = useState(false)
  const [tickerLoading, setTickerLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [kiwoomLoading, setKiwoomLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = () => {
    getISA().then(setList).catch(() => {})
    getISAHoldings().then(setHoldings).catch(() => {})
  }

  useEffect(() => { load() }, [])

  const latest = list.length ? list[list.length - 1].value : 0
  const prev = list.length > 1 ? list[list.length - 2].value : null
  const change = prev !== null ? latest - prev : null
  const holdingTotal = useMemo(
    () => holdings.reduce((sum, h) => sum + (Number(h.shares) || 0) * (Number(h.price) || 0), 0),
    [holdings]
  )

  const setHolding = (key, value) => setHoldingForm(f => ({ ...f, [key]: value }))

  const openBalanceModal = (value = '') => {
    setForm({ date: today(), value, note: value ? 'Yahoo 현재가 기준 ETF 평가금액' : '' })
    setBalanceModal(true)
  }

  const openAddHolding = () => {
    setHoldingForm(BLANK_HOLDING)
    setEditId(null)
    setHoldingModal(true)
  }

  const openEditHolding = (holding) => {
    setHoldingForm({
      ticker: holding.ticker || '',
      name: holding.name || '',
      shares: holding.shares || '',
      price: holding.price || '',
      note: holding.note || '',
    })
    setEditId(holding.id)
    setHoldingModal(true)
  }

  const handleTickerLookup = async () => {
    if (!holdingForm.ticker.trim()) return
    setTickerLoading(true)
    try {
      const data = await fetchStockPrice(holdingForm.ticker.trim())
      setHoldingForm(f => ({
        ...f,
        ticker: data.ticker,
        price: data.price,
        name: f.name || data.name,
      }))
    } catch (e) {
      alert(e.response?.data?.detail || '가격 조회 실패: 티커를 확인하세요')
    } finally {
      setTickerLoading(false)
    }
  }

  const handleBulkPriceUpdate = async () => {
    if (!holdings.length) return
    setPriceLoading(true)
    try {
      const prices = await fetchStockPrices(holdings.map(h => h.ticker))
      await Promise.all(
        holdings
          .filter(h => prices[h.ticker] != null)
          .map(h => updateISAHolding(h.id, { ...h, price: prices[h.ticker] }))
      )
      setLastUpdated(new Date().toLocaleTimeString('ko-KR'))
      load()
    } catch {
      alert('가격 일괄 조회 실패: 백엔드 서버 또는 티커를 확인하세요')
    } finally {
      setPriceLoading(false)
    }
  }

  const syncBalance = async () => {
    if (!holdings.length) {
      alert('먼저 ISA ETF 종목을 등록하세요')
      return
    }
    setSyncLoading(true)
    try {
      const prices = await fetchStockPrices(holdings.map(h => h.ticker))
      const updated = holdings.map(h => ({ ...h, price: prices[h.ticker] ?? h.price }))
      await Promise.all(updated.map(h => updateISAHolding(h.id, h)))
      const total = updated.reduce((sum, h) => sum + (Number(h.shares) || 0) * (Number(h.price) || 0), 0)
      await createISA({ date: today(), value: Math.round(total), note: 'Yahoo 현재가 기준 ETF 자동 동기화' })
      setLastUpdated(new Date().toLocaleTimeString('ko-KR'))
      load()
    } catch {
      alert('ISA 잔액 자동 동기화 실패: 백엔드 서버 또는 티커를 확인하세요')
    } finally {
      setSyncLoading(false)
    }
  }

  const syncKiwoom = async () => {
    setKiwoomLoading(true)
    try {
      const data = await syncISAFromKiwoom()
      setLastUpdated(new Date().toLocaleTimeString('ko-KR'))
      load()
      alert(`키움 ISA 동기화 완료: ${data.count}개 종목, ${won(data.value)}`)
    } catch (e) {
      alert(e.response?.data?.detail || '키움 ISA 동기화 실패: backend/.env 설정과 키움 API 신청 상태를 확인하세요')
    } finally {
      setKiwoomLoading(false)
    }
  }

  const submitBalance = async () => {
    if (!form.value) { alert('금액을 입력하세요'); return }
    try {
      await createISA({ ...form, value: +form.value })
      setBalanceModal(false)
      setForm({ date: today(), value: '', note: '' })
      load()
    } catch { alert('저장 실패') }
  }

  const submitHolding = async () => {
    if (!holdingForm.ticker.trim()) { alert('티커를 입력하세요'); return }
    const body = {
      ...holdingForm,
      ticker: holdingForm.ticker.toUpperCase(),
      shares: +holdingForm.shares || 0,
      price: +holdingForm.price || 0,
    }
    try {
      if (editId) await updateISAHolding(editId, body)
      else await createISAHolding(body)
      setHoldingModal(false)
      load()
    } catch { alert('저장 실패') }
  }

  const removeHolding = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    await deleteISAHolding(id)
    load()
  }

  const removeBalance = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    await deleteISA(id)
    load()
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <div><h2>키움 ISA</h2><p>한국 ETF 보유종목 · 잔액 자동 동기화</p></div>
        {!isRemoteReadonly && (
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={syncKiwoom} disabled={kiwoomLoading}>
              {kiwoomLoading ? '키움 조회 중...' : '키움에서 가져오기'}
            </button>
            <button className="btn btn-ghost" onClick={handleBulkPriceUpdate} disabled={priceLoading || !holdings.length}>
              {priceLoading ? '조회 중...' : '가격 일괄 업데이트'}
            </button>
            <button className="btn btn-ghost" onClick={syncBalance} disabled={syncLoading || !holdings.length}>
              {syncLoading ? '동기화 중...' : '잔액 자동 동기화'}
            </button>
            <button className="btn btn-ghost" onClick={() => openBalanceModal()}>수동 잔액 업데이트</button>
            <button className="btn btn-primary" onClick={openAddHolding}>+ ETF 추가</button>
          </div>
        )}
      </div>

      <div className="grid-3">
        <div className="stat-card accent-blue">
          <div className="stat-label">ETF 평가금액</div>
          <div className="stat-value">{won(holdingTotal)}</div>
          <div className="stat-sub">{holdings.length}개 종목{lastUpdated ? ` · ${lastUpdated} 갱신` : ''}</div>
        </div>
        <div className="stat-card accent-green">
          <div className="stat-label">기록된 ISA 잔액</div>
          <div className="stat-value">{won(latest)}</div>
          <div className="stat-sub">{list.length ? `${list[list.length - 1].date} 기준` : '기록 없음'}</div>
        </div>
        <div className="stat-card accent-gray">
          <div className="stat-label">이전 기록 대비</div>
          <div className={`stat-value ${change === null ? '' : change >= 0 ? 'txt-s' : 'txt-d'}`}>
            {change !== null ? `${change >= 0 ? '+' : ''}${won(change)}` : '-'}
          </div>
          <div className="stat-sub">잔액 기록 {list.length}건</div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <div className="section-title">ISA ETF 보유종목</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>티커</th><th>종목명</th><th className="num">수량</th>
              <th className="num">현재가</th><th className="num">평가금액</th><th>메모</th><th></th>
            </tr></thead>
            <tbody>
              {holdings.length === 0 ? (
                <tr><td colSpan={7}>
                  <div className="empty"><div className="empty-icon">ETF</div><p>등록된 ISA ETF 종목이 없습니다</p></div>
                </td></tr>
              ) : holdings.map(h => {
                const value = (Number(h.shares) || 0) * (Number(h.price) || 0)
                return (
                  <tr key={h.id}>
                    <td><strong>{h.ticker}</strong></td>
                    <td>{h.name || '-'}</td>
                    <td className="num">{Number(h.shares || 0).toLocaleString('ko-KR')}</td>
                    <td className="num">{won(h.price)}</td>
                    <td className="num fw7">{won(value)}</td>
                    <td className="txt-m">{h.note || '-'}</td>
                    <td>{!isRemoteReadonly && (
                      <div className="row-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditHolding(h)}>수정</button>
                        <button className="btn btn-danger btn-sm" onClick={() => removeHolding(h.id)}>삭제</button>
                      </div>
                    )}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <div className="section-title">잔액 이력</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>기록일</th><th className="num">잔액</th><th className="num">증감</th><th>메모</th><th></th>
            </tr></thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={5}>
                  <div className="empty"><div className="empty-icon">₩</div><p>기록된 잔액이 없습니다</p></div>
                </td></tr>
              ) : [...list].reverse().map((r, i, arr) => {
                const prevVal = arr[i + 1]?.value ?? null
                const chg = prevVal !== null ? r.value - prevVal : null
                return (
                  <tr key={r.id}>
                    <td className="txt-m">{r.date}</td>
                    <td className="num fw7">{won(r.value)}</td>
                    <td className="num">
                      {chg !== null
                        ? <span className={chg >= 0 ? 'txt-s' : 'txt-d'}>{chg >= 0 ? '+' : ''}{won(chg)}</span>
                        : <span className="txt-m">-</span>}
                    </td>
                    <td className="txt-m">{r.note || '-'}</td>
                    <td>{!isRemoteReadonly && <button className="btn btn-danger btn-sm" onClick={() => removeBalance(r.id)}>삭제</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={holdingModal} onClose={() => setHoldingModal(false)} title={editId ? 'ETF 수정' : 'ETF 추가'}>
        <FormGroup label="티커">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              value={holdingForm.ticker}
              onChange={e => setHolding('ticker', e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleTickerLookup()}
              placeholder="예: 069500 또는 069500.KS"
              style={{ flex: 1 }}
            />
            <button className="btn btn-ghost btn-sm" onClick={handleTickerLookup} disabled={tickerLoading || !holdingForm.ticker.trim()}>
              {tickerLoading ? '조회 중...' : '가격 조회'}
            </button>
          </div>
        </FormGroup>
        <FormGroup label="종목명">
          <input className="form-input" value={holdingForm.name} onChange={e => setHolding('name', e.target.value)} placeholder="가격 조회 시 자동 입력" />
        </FormGroup>
        <FormRow>
          <FormGroup label="보유 수량">
            <input className="form-input" type="number" step="0.001" value={holdingForm.shares} onChange={e => setHolding('shares', e.target.value)} placeholder="0" />
          </FormGroup>
          <FormGroup label="현재가 (원)">
            <input className="form-input" type="number" step="1" value={holdingForm.price} onChange={e => setHolding('price', e.target.value)} placeholder="조회 시 자동 입력" />
          </FormGroup>
        </FormRow>
        <FormGroup label="메모">
          <input className="form-input" value={holdingForm.note} onChange={e => setHolding('note', e.target.value)} placeholder="선택 입력" />
        </FormGroup>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setHoldingModal(false)}>취소</button>
          <button className="btn btn-primary" onClick={submitHolding}>저장</button>
        </div>
      </Modal>

      <Modal open={balanceModal} onClose={() => setBalanceModal(false)} title="ISA 잔액 업데이트">
        <FormRow>
          <FormGroup label="기록일">
            <input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </FormGroup>
          <FormGroup label="잔액 (원)">
            <input className="form-input" type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0" />
          </FormGroup>
        </FormRow>
        <FormGroup label="메모">
          <input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="선택 입력" />
        </FormGroup>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setBalanceModal(false)}>취소</button>
          <button className="btn btn-primary" onClick={submitBalance}>저장</button>
        </div>
      </Modal>
    </div>
  )
}
