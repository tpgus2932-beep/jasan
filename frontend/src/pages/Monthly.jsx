import { useEffect, useState } from 'react'
import { useApp } from '../App'
import Modal, { FormGroup, FormRow } from '../components/Modal'
import {
  createMonthly,
  deleteMonthly,
  getCryptoHistory,
  getHoldings,
  getISA,
  getMonthly,
  getRealEstate,
  getSavings,
  isRemoteReadonly,
  updateMonthly,
} from '../api'

const won = n => Math.round(n).toLocaleString('ko-KR') + '원'
const pct = n => (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'

const currentYearMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const INV_BLANK = {
  inv_savings: '',
  inv_overseas: '',
  inv_isa: '',
  inv_crypto: '',
  inv_real_estate: '',
}

const BLANK = {
  year_month: currentYearMonth(),
  savings: '',
  overseas: '',
  isa: '',
  crypto: '',
  real_estate: '',
  other: '',
  ...INV_BLANK,
  note: '',
}

function totalInv(r) {
  return (
    (r.inv_savings || 0) +
    (r.inv_overseas || 0) +
    (r.inv_isa || 0) +
    (r.inv_crypto || 0) +
    (r.inv_real_estate || 0)
  )
}

function realEstateAssetValue(r) {
  return r.type === '매매' ? (r.current_value || r.purchase_price || 0) : (r.deposit || 0)
}

export default function Monthly() {
  const { fx } = useApp()
  const [list, setList] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [editId, setEditId] = useState(null)
  const [autoFilled, setAutoFilled] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()))

  const load = () => getMonthly().then(setList).catch(() => {})
  useEffect(() => { load() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openAdd = () => {
    setForm(BLANK)
    setEditId(null)
    setAutoFilled(null)
    setModal(true)
  }

  const openEdit = r => {
    setForm({
      year_month: r.year_month,
      savings: r.savings || '',
      overseas: r.overseas || '',
      isa: r.isa || '',
      crypto: r.crypto || '',
      real_estate: r.real_estate || '',
      other: r.other || '',
      inv_savings: r.inv_savings || '',
      inv_overseas: r.inv_overseas || '',
      inv_isa: r.inv_isa || '',
      inv_crypto: r.inv_crypto || '',
      inv_real_estate: r.inv_real_estate || '',
      note: r.note || '',
    })
    setEditId(r.id)
    setAutoFilled(null)
    setModal(true)
  }

  const handleAutoFill = async () => {
    setLoading(true)
    try {
      const [savings, holdings, isaList, cryptoList, reList] = await Promise.all([
        getSavings(),
        getHoldings(),
        getISA(),
        getCryptoHistory(),
        getRealEstate(),
      ])
      const savTotal = savings.reduce((s, a) => s + (a.balance || 0), 0)
      const ovKrw = Math.round(holdings.reduce((s, h) => s + h.shares * h.price, 0) * fx)
      const isaVal = isaList.length ? isaList[isaList.length - 1].value : 0
      const cryptoVal = cryptoList.length ? cryptoList[cryptoList.length - 1].value : 0
      const activeRE = reList.filter(r => r.status === 'active')
      const reNet = activeRE.reduce((s, r) => s + realEstateAssetValue(r) - (r.debt || 0), 0)

      setAutoFilled({
        savings: savTotal,
        overseas: ovKrw,
        isa: isaVal,
        crypto: cryptoVal,
        real_estate: reNet,
        savCount: savings.length,
        ovTickers: holdings.map(h => h.ticker).join(', ') || '없음',
        isaDate: isaList.length ? isaList[isaList.length - 1].date : null,
        cryptoDate: cryptoList.length ? cryptoList[cryptoList.length - 1].date : null,
        reCount: activeRE.length,
      })
      setForm({
        year_month: currentYearMonth(),
        savings: savTotal,
        overseas: ovKrw,
        isa: isaVal,
        crypto: cryptoVal,
        real_estate: reNet,
        other: '',
        ...INV_BLANK,
        note: '',
      })
      setEditId(null)
      setModal(true)
    } catch {
      alert('데이터를 불러오지 못했습니다. 백엔드가 실행 중인지 확인하세요.')
    } finally {
      setLoading(false)
    }
  }

  const submit = async () => {
    if (!form.year_month || !/^\d{4}-\d{2}$/.test(form.year_month)) {
      alert('연월을 YYYY-MM 형식으로 입력하세요. 예: 2024-03')
      return
    }

    const body = {
      year_month: form.year_month,
      savings: +form.savings || 0,
      overseas: +form.overseas || 0,
      isa: +form.isa || 0,
      crypto: +form.crypto || 0,
      real_estate: +form.real_estate || 0,
      other: +form.other || 0,
      inv_savings: +form.inv_savings || 0,
      inv_overseas: +form.inv_overseas || 0,
      inv_isa: +form.inv_isa || 0,
      inv_crypto: +form.inv_crypto || 0,
      inv_real_estate: +form.inv_real_estate || 0,
      note: form.note || '',
    }

    try {
      if (editId) await updateMonthly(editId, body)
      else await createMonthly(body)
      setModal(false)
      load()
    } catch (e) {
      alert(e.response?.data?.detail || '저장 실패')
    }
  }

  const remove = async id => {
    if (!confirm('삭제하시겠습니까?')) return
    await deleteMonthly(id)
    load()
  }

  const sorted = [...list].sort((a, b) => a.year_month.localeCompare(b.year_month))
  const years = [...new Set(sorted.map(r => r.year_month.slice(0, 4)))].sort()
  const filtered = filterYear === 'all' ? sorted : sorted.filter(r => r.year_month.startsWith(filterYear))
  const thisMonth = list.find(r => r.year_month === currentYearMonth())

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h2>월간기록</h2>
          <p>월별 자산 스냅샷 · 카테고리별 순수 수익률 추적</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-ghost" onClick={openAdd}>직접 입력</button>
          <button className="btn btn-primary" onClick={handleAutoFill} disabled={loading || isRemoteReadonly}>
            {loading ? '불러오는 중...' : `${currentYearMonth()} 현황 저장`}
          </button>
        </div>
      </div>

      {thisMonth && (
        <div className="alert alert-info">
          {currentYearMonth()} 기록이 이미 존재합니다. 수정은 표의 <strong>수정</strong> 버튼을 이용하세요.
        </div>
      )}

      <div className="section">
        <div className="section-header">
          <div className="section-title">연도 필터</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className={`btn btn-sm ${filterYear === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterYear('all')}>
              전체
            </button>
            {years.map(y => (
              <button key={y} className={`btn btn-sm ${filterYear === y ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterYear(y)}>
                {y}년
              </button>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>연월</th>
                <th className="num">적금</th>
                <th className="num">해외직투</th>
                <th className="num">ISA</th>
                <th className="num">코인</th>
                <th className="num">부동산</th>
                <th className="num">기타</th>
                <th className="num">총 자산</th>
                <th className="num">추가투자 합계</th>
                <th className="num">전월 증감</th>
                <th className="num">총 증감률</th>
                <th className="num">순수 수익률</th>
                <th>메모</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={14}>
                    <div className="empty">
                      <div className="empty-icon">📊</div>
                      <p>
                        <strong>현황 저장</strong> 버튼으로 현재 계좌 데이터를 불러오거나<br />직접 입력하세요
                      </p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map((r, i) => {
                const prev = i > 0 ? filtered[i - 1] : null
                const changeAmt = prev ? r.total - prev.total : null
                const changeRate = prev && prev.total > 0 ? (r.total - prev.total) / prev.total * 100 : null
                const invTotal = totalInv(r)
                const pureAmt = changeAmt !== null ? changeAmt - invTotal : null
                const pureRate = prev && prev.total > 0 && invTotal > 0 ? pureAmt / prev.total * 100 : null

                return (
                  <tr key={r.id}>
                    <td><strong>{r.year_month}</strong></td>
                    <td className="num">{won(r.savings || 0)}</td>
                    <td className="num">{won(r.overseas || 0)}</td>
                    <td className="num">{won(r.isa || 0)}</td>
                    <td className="num">{won(r.crypto || 0)}</td>
                    <td className="num">{won(r.real_estate || 0)}</td>
                    <td className="num txt-m">{won(r.other || 0)}</td>
                    <td className="num fw7">{won(r.total)}</td>
                    <td className="num txt-m">
                      {invTotal > 0
                        ? (
                          <span title={`적금 ${won(r.inv_savings || 0)} / 해외 ${won(r.inv_overseas || 0)} / ISA ${won(r.inv_isa || 0)} / 코인 ${won(r.inv_crypto || 0)} / 부동산 ${won(r.inv_real_estate || 0)}`}>
                            {won(invTotal)}
                          </span>
                        )
                        : <span className="txt-m">—</span>}
                    </td>
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
                    <td className="num">
                      {pureRate !== null
                        ? <span className={`badge ${pureRate >= 0 ? 'badge-green' : 'badge-red'}`}>{pct(pureRate)}</span>
                        : <span className="txt-m">—</span>}
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

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? '월간기록 수정' : '월간기록 추가'}>
        {autoFilled && (
          <div className="autofill-info">
            <div className="autofill-row"><span>적금</span><span>{autoFilled.savCount}개 계좌 잔액 합산</span></div>
            <div className="autofill-row"><span>해외직투</span><span>{autoFilled.ovTickers} · 환율 {fx.toLocaleString()}원</span></div>
            <div className="autofill-row"><span>ISA</span><span>{autoFilled.isaDate ? `${autoFilled.isaDate} 기준` : '기록 없음'}</span></div>
            <div className="autofill-row"><span>코인</span><span>{autoFilled.cryptoDate ? `${autoFilled.cryptoDate} 기준` : '기록 없음'}</span></div>
            <div className="autofill-row"><span>부동산</span><span>활성 {autoFilled.reCount}건 순자산 합산</span></div>
          </div>
        )}

        <FormGroup label="연월 (YYYY-MM)">
          <input className="form-input" type="text" value={form.year_month} onChange={e => set('year_month', e.target.value)} placeholder="2024-03" maxLength={7} />
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

        <div style={{ margin: '12px 0 6px', fontSize: 12, fontWeight: 600, opacity: 0.7 }}>
          추가 투자금은 순수 수익률 계산에서 제외됩니다.
        </div>

        <FormRow>
          <FormGroup label="적금 추가 납입">
            <input className="form-input" type="number" value={form.inv_savings} onChange={e => set('inv_savings', e.target.value)} placeholder="0" />
          </FormGroup>
          <FormGroup label="해외직투 추가 매수">
            <input className="form-input" type="number" value={form.inv_overseas} onChange={e => set('inv_overseas', e.target.value)} placeholder="0" />
          </FormGroup>
        </FormRow>

        <FormRow>
          <FormGroup label="ISA 납입">
            <input className="form-input" type="number" value={form.inv_isa} onChange={e => set('inv_isa', e.target.value)} placeholder="0" />
          </FormGroup>
          <FormGroup label="코인 추가 매수">
            <input className="form-input" type="number" value={form.inv_crypto} onChange={e => set('inv_crypto', e.target.value)} placeholder="0" />
          </FormGroup>
        </FormRow>

        <FormRow>
          <FormGroup label="부동산 추가 투자">
            <input className="form-input" type="number" value={form.inv_real_estate} onChange={e => set('inv_real_estate', e.target.value)} placeholder="0" />
          </FormGroup>
          <FormGroup label="메모">
            <input className="form-input" value={form.note} onChange={e => set('note', e.target.value)} placeholder="선택 입력" />
          </FormGroup>
        </FormRow>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setModal(false)}>취소</button>
          <button className="btn btn-primary" onClick={submit}>저장</button>
        </div>
      </Modal>
    </div>
  )
}
