import { useEffect, useState } from 'react'
import { useApp } from '../App'
import Modal, { FormGroup, FormRow } from '../components/Modal'
import { getYearly, createYearly, updateYearly, deleteYearly, getSavings, getHoldings, getISA, getCryptoHistory, getRealEstate, isRemoteReadonly } from '../api'

const won = n => Math.round(n).toLocaleString('ko-KR') + '원'
const pct = n => (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'

const BLANK = { year: new Date().getFullYear(), savings: '', overseas: '', isa: '', crypto: '', other: '', note: '' }

export default function Yearly() {
  const { fx } = useApp()
  const [list, setList]       = useState([])
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(BLANK)
  const [editId, setEditId]   = useState(null)
  const [autoFilled, setAutoFilled] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = () => getYearly().then(setList).catch(() => {})
  useEffect(() => { load() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openAdd = () => { setForm(BLANK); setEditId(null); setAutoFilled(null); setModal(true) }
  const openEdit = (r) => {
    setForm({ year: r.year, savings: r.savings || '', overseas: r.overseas || '', isa: r.isa || '', crypto: r.crypto || '', real_estate: r.real_estate || '', other: r.other || '', note: r.note || '' })
    setEditId(r.id); setAutoFilled(null); setModal(true)
  }

  const handleAutoFill = async () => {
    setLoading(true)
    try {
      const [savings, holdings, isaList, cryptoList, reList] = await Promise.all([
        getSavings(), getHoldings(), getISA(), getCryptoHistory(), getRealEstate()
      ])
      const savTotal = savings.reduce((s, a) => s + (a.balance || 0), 0)
      const ovKrw    = Math.round(holdings.reduce((s, h) => s + h.shares * h.price, 0) * fx)
      const isaVal   = isaList.length ? isaList[isaList.length - 1].value : 0
      const cryptoVal = cryptoList.length ? cryptoList[cryptoList.length - 1].value : 0
      const activeRE = reList.filter(r => r.status === 'active')
      const reAsset  = n => n.type === '매매' ? (n.current_value || n.purchase_price || 0) : (n.deposit || 0)
      const reNet    = activeRE.reduce((s, r) => s + reAsset(r) - (r.debt || 0), 0)

      setAutoFilled({
        savings: savTotal, overseas: ovKrw, isa: isaVal, crypto: cryptoVal, real_estate: reNet,
        savCount: savings.length,
        ovTickers: holdings.map(h => h.ticker).join(', ') || '없음',
        isaDate: isaList.length ? isaList[isaList.length - 1].date : null,
        cryptoDate: cryptoList.length ? cryptoList[cryptoList.length - 1].date : null,
        reCount: activeRE.length,
      })
      setForm({ year: new Date().getFullYear(), savings: savTotal, overseas: ovKrw, isa: isaVal, crypto: cryptoVal, real_estate: reNet, other: '', note: '' })
      setEditId(null); setModal(true)
    } catch {
      alert('데이터를 불러오지 못했습니다. 백엔드가 실행 중인지 확인하세요.')
    } finally { setLoading(false) }
  }

  const submit = async () => {
    if (!form.year) { alert('연도를 입력하세요'); return }
    const body = {
      year: +form.year,
      savings: +form.savings || 0, overseas: +form.overseas || 0,
      isa: +form.isa || 0, crypto: +form.crypto || 0, real_estate: +form.real_estate || 0,
      other: +form.other || 0, note: form.note || ''
    }
    try {
      if (editId) await updateYearly(editId, body)
      else await createYearly(body)
      setModal(false); load()
    } catch (e) { alert(e.response?.data?.detail || '저장 실패') }
  }

  const remove = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    await deleteYearly(id); load()
  }

  const sorted = [...list].sort((a, b) => a.year - b.year)
  const thisYear = list.find(r => r.year === new Date().getFullYear())

  return (
    <div className="page-enter">
      <div className="page-header">
        <div><h2>연간기록</h2><p>연도별 자산 스냅샷 · 성장률 추적</p></div>
        <div className="page-header-actions">
          <button className="btn btn-ghost" onClick={openAdd}>직접 입력</button>
          <button className="btn btn-primary" onClick={handleAutoFill} disabled={loading}>
            {loading ? '불러오는 중...' : `⟳ ${new Date().getFullYear()}년 현황 저장`}
          </button>
        </div>
      </div>

      {thisYear && (
        <div className="alert alert-info">
          {new Date().getFullYear()}년 기록이 이미 존재합니다.
          현황을 다시 불러오면 새 연도로 추가됩니다. 수정은 표의 <strong>수정</strong> 버튼을 이용하세요.
        </div>
      )}

      {sorted.length >= 2 && (() => {
        const last2 = sorted.slice(-2)
        const growthAmt  = last2[1].total - last2[0].total
        const growthRate = last2[0].total > 0 ? growthAmt / last2[0].total * 100 : null
        return (
          <div className={`alert ${growthRate >= 0 ? 'alert-success' : 'alert-danger'}`}>
            <span>{growthRate >= 0 ? '📈' : '📉'}</span>
            <span>
              {last2[0].year}년 → {last2[1].year}년 전년 대비{' '}
              <strong>{growthRate !== null ? pct(growthRate) : '—'}</strong>
              {' '}({growthAmt >= 0 ? '+' : ''}{won(growthAmt)})
            </span>
          </div>
        )
      })()}

      <div className="section">
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>연도</th>
              <th className="num">적금</th><th className="num">해외직투</th>
              <th className="num">ISA</th><th className="num">코인</th><th className="num">부동산</th>
              <th className="num">기타</th><th className="num">총 자산</th>
              <th className="num">전년 증감</th><th className="num">수익률</th>
              <th>메모</th><th></th>
            </tr></thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={12}>
                  <div className="empty">
                    <div className="empty-icon">📅</div>
                    <p><strong>"현황 저장"</strong> 버튼으로 현재 계좌 데이터를 불러오거나<br />직접 입력하세요</p>
                  </div>
                </td></tr>
              ) : sorted.map((r, i) => {
                const prev       = i > 0 ? sorted[i - 1] : null
                const changeAmt  = prev ? r.total - prev.total : null
                const changeRate = prev && prev.total > 0 ? (r.total - prev.total) / prev.total * 100 : null
                return (
                  <tr key={r.id}>
                    <td><strong>{r.year}년</strong></td>
                    <td className="num">{won(r.savings      || 0)}</td>
                    <td className="num">{won(r.overseas     || 0)}</td>
                    <td className="num">{won(r.isa          || 0)}</td>
                    <td className="num">{won(r.crypto       || 0)}</td>
                    <td className="num">{won(r.real_estate  || 0)}</td>
                    <td className="num txt-m">{won(r.other  || 0)}</td>
                    <td className="num fw7">{won(r.total)}</td>
                    <td className="num">
                      {changeAmt !== null
                        ? <span className={changeAmt >= 0 ? 'txt-s' : 'txt-d'}>{changeAmt >= 0 ? '+' : ''}{won(changeAmt)}</span>
                        : <span className="txt-m">—</span>}
                    </td>
                    <td className="num">
                      {changeRate !== null
                        ? <span className={`badge ${changeRate >= 0 ? 'badge-green' : 'badge-red'}`}>{pct(changeRate)}</span>
                        : '—'}
                    </td>
                    <td className="txt-m">{r.note || '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>수정</button>
                        <button className="btn btn-danger btn-sm" onClick={() => remove(r.id)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? '연간기록 수정' : '연간기록 추가'}>
        {autoFilled && (
          <div className="autofill-info">
            <div className="autofill-row"><span>🏦 적금</span><span>{autoFilled.savCount}개 계좌 잔액 합산</span></div>
            <div className="autofill-row"><span>🌐 해외직투</span><span>{autoFilled.ovTickers} · 환율 {fx.toLocaleString()}원</span></div>
            <div className="autofill-row"><span>📈 ISA</span><span>{autoFilled.isaDate ? `${autoFilled.isaDate} 기준` : '기록 없음'}</span></div>
            <div className="autofill-row"><span>₿ 코인</span><span>{autoFilled.cryptoDate ? `${autoFilled.cryptoDate} 기준` : '기록 없음'}</span></div>
            <div className="autofill-row"><span>🏠 부동산</span><span>활성 {autoFilled.reCount}건 순자산 합산</span></div>
          </div>
        )}
        <FormGroup label="연도">
          <input className="form-input" type="number" value={form.year} onChange={e => set('year', e.target.value)} placeholder="2024" min="2000" max="2100" />
        </FormGroup>
        <FormRow>
          <FormGroup label="적금 (원)">
            <input className="form-input" type="number" value={form.savings} onChange={e => set('savings', e.target.value)} placeholder="0" />
          </FormGroup>
          <FormGroup label="해외직투 (원)">
            <input className="form-input" type="number" value={form.overseas} onChange={e => set('overseas', e.target.value)} placeholder="0" />
          </FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="ISA (원)">
            <input className="form-input" type="number" value={form.isa} onChange={e => set('isa', e.target.value)} placeholder="0" />
          </FormGroup>
          <FormGroup label="코인 (원)">
            <input className="form-input" type="number" value={form.crypto} onChange={e => set('crypto', e.target.value)} placeholder="0" />
          </FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="부동산 순자산 (원)">
            <input className="form-input" type="number" value={form.real_estate} onChange={e => set('real_estate', e.target.value)} placeholder="0" />
          </FormGroup>
          <FormGroup label="기타 자산 (원)">
            <input className="form-input" type="number" value={form.other} onChange={e => set('other', e.target.value)} placeholder="0" />
          </FormGroup>
        </FormRow>
        <FormGroup label="메모">
          <input className="form-input" value={form.note} onChange={e => set('note', e.target.value)} placeholder="선택 입력" />
        </FormGroup>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setModal(false)}>취소</button>
          <button className="btn btn-primary" onClick={submit}>저장</button>
        </div>
      </Modal>
    </div>
  )
}
