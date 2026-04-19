import { useEffect, useState } from 'react'
import Modal, { FormGroup, FormRow } from '../components/Modal'
import { getSavings, createSaving, updateSaving, deleteSaving, isRemoteReadonly } from '../api'

const won = n => Math.round(n).toLocaleString('ko-KR') + '원'

function daysLeft(maturity) {
  return Math.ceil((new Date(maturity) - new Date()) / 86400000)
}

const BLANK = {
  bank: '', name: '', principal: '', balance: '',
  monthly_payment: '', payment_day: 1, last_paid_month: '',
  rate: '', start_date: '', maturity_date: '', status: 'active', note: ''
}

export default function Savings() {
  const [list, setList]   = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm]   = useState(BLANK)
  const [editId, setEditId] = useState(null)

  const load = () => getSavings().then(setList).catch(() => {})
  useEffect(() => { load() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openAdd  = () => { setForm(BLANK); setEditId(null); setModal(true) }
  const openEdit = (item) => {
    setForm({
      ...item,
      principal: item.principal || '',
      balance: item.balance || '',
      monthly_payment: item.monthly_payment || '',
      payment_day: item.payment_day || 1,
      last_paid_month: item.last_paid_month || '',
      rate: item.rate || '',
    })
    setEditId(item.id); setModal(true)
  }

  const submit = async () => {
    if (!form.name.trim()) { alert('계좌명을 입력하세요'); return }
    const body = {
      ...form,
      principal: +form.principal || 0,
      balance: +form.balance || 0,
      monthly_payment: +form.monthly_payment || 0,
      payment_day: Math.max(1, Math.min(+form.payment_day || 1, 31)),
      rate: +form.rate || 0,
    }
    try {
      if (editId) await updateSaving(editId, body)
      else await createSaving(body)
      setModal(false); load()
    } catch { alert('저장 실패') }
  }

  const remove = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    await deleteSaving(id); load()
  }

  const total    = list.reduce((s, a) => s + (a.balance   || 0), 0)
  const principal= list.reduce((s, a) => s + (a.principal || 0), 0)
  const interest = total - principal

  return (
    <div className="page-enter">
      <div className="page-header">
        <div><h2>적금</h2><p>적금·예금 계좌 관리</p></div>
        {!isRemoteReadonly && <button className="btn btn-primary" onClick={openAdd}>+ 계좌 추가</button>}
      </div>

      <div className="grid-3">
        <div className="stat-card accent-blue">
          <div className="stat-label">현재 잔액 합계</div>
          <div className="stat-value">{won(total)}</div>
          <div className="stat-sub">{list.length}개 계좌</div>
        </div>
        <div className="stat-card accent-green">
          <div className="stat-label">납입 원금 합계</div>
          <div className="stat-value">{won(principal)}</div>
        </div>
        <div className="stat-card accent-orange">
          <div className="stat-label">이자 누적</div>
          <div className={`stat-value ${interest >= 0 ? 'txt-s' : 'txt-d'}`}>{won(interest)}</div>
          <div className="stat-sub">{principal > 0 ? `${((interest / principal) * 100).toFixed(2)}% 수익` : '—'}</div>
        </div>
      </div>

      <div className="section">
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>금융기관</th><th>계좌명</th>
              <th className="num">원금</th><th className="num">현재잔액</th>
              <th className="num">월 납입금</th><th>납입일</th>
              <th className="num">금리</th><th>만기일</th><th>상태</th><th></th>
            </tr></thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={10}>
                  <div className="empty"><div className="empty-icon">🏦</div><p>등록된 계좌가 없습니다</p></div>
                </td></tr>
              ) : list.map(a => {
                const dl = a.maturity_date ? daysLeft(a.maturity_date) : null
                const gain = (a.balance || 0) - (a.principal || 0)
                let badge
                if (a.status === 'matured')             badge = <span className="badge badge-green">만기</span>
                else if (a.status === 'closed')         badge = <span className="badge badge-orange">해지</span>
                else if (dl !== null && dl <= 30)       badge = <span className="badge badge-red">D-{dl}</span>
                else if (dl !== null && dl <= 90)       badge = <span className="badge badge-orange">D-{dl}</span>
                else                                    badge = <span className="badge badge-blue">유지중</span>

                return (
                  <tr key={a.id}>
                    <td className="txt-m small">{a.bank || '—'}</td>
                    <td>
                      <div className="fw6">{a.name}</div>
                      {a.note && <div className="small txt-m">{a.note}</div>}
                    </td>
                    <td className="num">{won(a.principal || 0)}</td>
                    <td className="num">
                      <div className="fw7">{won(a.balance || 0)}</div>
                      {gain !== 0 && <div className={`small ${gain >= 0 ? 'txt-s' : 'txt-d'}`}>{gain >= 0 ? '+' : ''}{won(gain)}</div>}
                    </td>
                    <td className="num">{a.monthly_payment ? won(a.monthly_payment) : '-'}</td>
                    <td className="txt-m">
                      {a.monthly_payment ? `매월 ${a.payment_day || 1}일` : '-'}
                      {a.last_paid_month && <div className="small txt-m">반영 {a.last_paid_month}</div>}
                    </td>
                    <td className="num">{a.rate ? `${a.rate}%` : '-'}</td>
                    <td className="txt-m">{a.maturity_date || '—'}</td>
                    <td>{badge}</td>
                    <td>{!isRemoteReadonly && (
                      <div className="row-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)}>수정</button>
                        <button className="btn btn-danger btn-sm" onClick={() => remove(a.id)}>삭제</button>
                      </div>
                    )}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? '계좌 수정' : '계좌 추가'}>
        <FormRow>
          <FormGroup label="금융기관">
            <input className="form-input" value={form.bank} onChange={e => set('bank', e.target.value)} placeholder="예) 카카오뱅크" />
          </FormGroup>
          <FormGroup label="계좌명">
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="예) 자유적금" />
          </FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="원금 (원)">
            <input className="form-input" type="number" value={form.principal} onChange={e => set('principal', e.target.value)} placeholder="0" />
          </FormGroup>
          <FormGroup label="현재잔액 (원)">
            <input className="form-input" type="number" value={form.balance} onChange={e => set('balance', e.target.value)} placeholder="0" />
          </FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="월 납입금 (원)">
            <input className="form-input" type="number" value={form.monthly_payment} onChange={e => set('monthly_payment', e.target.value)} placeholder="0" />
          </FormGroup>
          <FormGroup label="납입일">
            <input className="form-input" type="number" min="1" max="31" value={form.payment_day} onChange={e => set('payment_day', e.target.value)} placeholder="1" />
          </FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="연이율 (%)">
            <input className="form-input" type="number" step="0.01" value={form.rate} onChange={e => set('rate', e.target.value)} placeholder="3.50" />
          </FormGroup>
          <FormGroup label="상태">
            <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="active">유지중</option>
              <option value="matured">만기</option>
              <option value="closed">해지</option>
            </select>
          </FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="시작일">
            <input className="form-input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </FormGroup>
          <FormGroup label="만기일">
            <input className="form-input" type="date" value={form.maturity_date} onChange={e => set('maturity_date', e.target.value)} />
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
