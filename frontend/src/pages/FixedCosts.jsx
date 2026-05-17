import { useEffect, useState } from 'react'
import Modal, { FormGroup, FormRow } from '../components/Modal'
import {
  getFixedCosts, createFixedCost, updateFixedCost, deleteFixedCost,
  getFixedSavings, createFixedSaving, updateFixedSaving, deleteFixedSaving,
  getSettings, updateMonthlyIncome, isRemoteReadonly,
} from '../api'

const won = n => Math.round(n).toLocaleString('ko-KR') + '원'

// ── 고정비용 탭 ──────────────────────────────────────────────────────────────

const CATEGORIES = ['주거비', '통신/구독', '보험', '금융', '교통', '기타']
const PAYMENT_METHODS = ['자동이체', '카드', '현금', '기타']

const CAT_META = {
  '주거비':    { icon: '🏠', color: 'badge-blue'   },
  '통신/구독': { icon: '📱', color: 'badge-purple'  },
  '보험':      { icon: '🛡️', color: 'badge-green'  },
  '금융':      { icon: '💳', color: 'badge-orange'  },
  '교통':      { icon: '🚗', color: 'badge-muted'   },
  '기타':      { icon: '📦', color: 'badge-muted'   },
}

const BLANK_COST = {
  name: '', category: '주거비', amount: '',
  billing_day: 1, payment_method: '자동이체', status: 'active', note: '',
}

function StatusToggle({ status, onChange }) {
  return (
    <button
      className={`fc-toggle ${status === 'active' ? 'fc-toggle-on' : 'fc-toggle-off'}`}
      onClick={onChange}
      title={status === 'active' ? '활성 (클릭하면 일시정지)' : '일시정지 (클릭하면 활성)'}
    >
      {status === 'active' ? '활성' : '정지'}
    </button>
  )
}

function FixedCostsTab() {
  const [list, setList]     = useState([])
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(BLANK_COST)
  const [editId, setEditId] = useState(null)

  const load = () => getFixedCosts().then(setList).catch(() => {})
  useEffect(() => { load() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openAdd = (cat = '주거비') => {
    setForm({ ...BLANK_COST, category: cat }); setEditId(null); setModal(true)
  }
  const openEdit = (item) => {
    setForm({ ...item, amount: item.amount || '' })
    setEditId(item.id); setModal(true)
  }

  const submit = async () => {
    if (!form.name.trim()) { alert('항목명을 입력하세요'); return }
    if (!form.amount || +form.amount <= 0) { alert('금액을 입력하세요'); return }
    const body = { ...form, amount: +form.amount || 0, billing_day: +form.billing_day || 1 }
    try {
      if (editId) await updateFixedCost(editId, body)
      else await createFixedCost(body)
      setModal(false); load()
    } catch { alert('저장 실패') }
  }

  const remove = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    await deleteFixedCost(id); load()
  }

  const toggleStatus = async (item) => {
    const next = item.status === 'active' ? 'paused' : 'active'
    await updateFixedCost(item.id, { ...item, status: next }).catch(() => {})
    load()
  }

  const active  = list.filter(r => r.status === 'active')
  const monthly = active.reduce((s, r) => s + (r.amount || 0), 0)

  const grouped = CATEGORIES.reduce((acc, cat) => {
    const items = list.filter(r => r.category === cat)
    if (items.length > 0) acc[cat] = items
    return acc
  }, {})

  return (
    <div>
      <div className="grid-3">
        <div className="stat-card accent-red">
          <div className="stat-label">월 고정비 합계</div>
          <div className="stat-value txt-d">{won(monthly)}</div>
          <div className="stat-sub">활성 {active.length}개 항목 기준</div>
        </div>
        <div className="stat-card accent-orange">
          <div className="stat-label">연간 고정비 추정</div>
          <div className="stat-value">{won(monthly * 12)}</div>
          <div className="stat-sub">월 합계 × 12개월</div>
        </div>
        <div className="stat-card accent-blue">
          <div className="stat-label">카테고리</div>
          <div className="stat-value">{Object.keys(grouped).length}개</div>
          <div className="stat-sub">전체 {list.length}개 항목</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        {!isRemoteReadonly && (
          <button className="btn btn-primary" onClick={() => openAdd()}>+ 항목 추가</button>
        )}
      </div>

      {list.length === 0 ? (
        <div className="section">
          <div className="empty">
            <div className="empty-icon">💰</div>
            <p>등록된 고정비용이 없습니다</p>
            <p className="small txt-m" style={{ marginTop: 6 }}>
              월세, 관리비, 통신비, 보험료 등을 추가해보세요
            </p>
            {!isRemoteReadonly && (
              <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => openAdd()}>
                + 첫 항목 추가
              </button>
            )}
          </div>
        </div>
      ) : (
        CATEGORIES.map(cat => {
          const items = grouped[cat]
          if (!items) return null
          const catTotal = items.filter(r => r.status === 'active').reduce((s, r) => s + (r.amount || 0), 0)
          const meta = CAT_META[cat]
          return (
            <div className="section fc-section" key={cat}>
              <div className="fc-section-header">
                <div className="fc-section-title">
                  <span className="fc-cat-icon">{meta.icon}</span>
                  <span className="fw6">{cat}</span>
                  <span className={`badge ${meta.color}`}>{items.length}개</span>
                </div>
                <div className="fc-section-right">
                  <span className="fc-cat-total">{won(catTotal)}/월</span>
                  {!isRemoteReadonly && (
                    <button className="btn btn-ghost btn-sm" onClick={() => openAdd(cat)}>+ 추가</button>
                  )}
                </div>
              </div>
              <div className="fc-list">
                {items.map(r => (
                  <div key={r.id} className={`fc-item ${r.status !== 'active' ? 'fc-item-paused' : ''}`}>
                    <div className="fc-item-left">
                      <div className="fc-item-name fw6">{r.name}</div>
                      <div className="fc-item-meta">
                        <span className="fc-meta-chip">{r.payment_method}</span>
                        {r.billing_day > 0 && (
                          <span className="fc-meta-chip">매월 {r.billing_day}일</span>
                        )}
                        {r.note && <span className="txt-m small">{r.note}</span>}
                      </div>
                    </div>
                    <div className="fc-item-right">
                      <div className="fc-item-amount">{won(r.amount)}<span className="fc-per-month">/월</span></div>
                      {!isRemoteReadonly && (
                        <div className="fc-item-actions">
                          <StatusToggle status={r.status} onChange={() => toggleStatus(r)} />
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>수정</button>
                          <button className="btn btn-danger btn-sm" onClick={() => remove(r.id)}>삭제</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}

      {list.length > 0 && (
        <div className="section fc-summary-bar">
          <div className="fc-summary-title">카테고리별 소계</div>
          <div className="fc-summary-list">
            {CATEGORIES.map(cat => {
              const items = grouped[cat]
              if (!items) return null
              const catTotal = items.filter(r => r.status === 'active').reduce((s, r) => s + (r.amount || 0), 0)
              const pct = monthly > 0 ? (catTotal / monthly) * 100 : 0
              const meta = CAT_META[cat]
              return (
                <div key={cat} className="fc-summary-row">
                  <div className="fc-summary-label">
                    <span>{meta.icon}</span>
                    <span>{cat}</span>
                  </div>
                  <div className="fc-summary-bar-wrap">
                    <div className="fc-summary-bar-track">
                      <div className="fc-summary-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="fc-summary-pct">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="fc-summary-amount">{won(catTotal)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? '고정비용 수정' : '고정비용 추가'}>
        <FormRow>
          <FormGroup label="항목명">
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="예) 아파트 관리비" autoFocus />
          </FormGroup>
          <FormGroup label="카테고리">
            <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CAT_META[c].icon} {c}</option>)}
            </select>
          </FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="금액 (원/월)">
            <input className="form-input" type="number" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" />
          </FormGroup>
          <FormGroup label="청구일 (매월)">
            <input className="form-input" type="number" min="1" max="31" value={form.billing_day} onChange={e => set('billing_day', e.target.value)} placeholder="1" />
          </FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="결제 수단">
            <select className="form-input" value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="상태">
            <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="active">활성</option>
              <option value="paused">일시정지</option>
            </select>
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

// ── 고정저축 탭 ──────────────────────────────────────────────────────────────

const SAVING_CATEGORIES = ['적금', '주식', 'ETF', '펀드', '코인', '기타']

const SAVING_CAT_META = {
  '적금': { icon: '🏦', color: 'badge-blue'   },
  '주식': { icon: '📈', color: 'badge-green'  },
  'ETF':  { icon: '📊', color: 'badge-orange' },
  '펀드': { icon: '💼', color: 'badge-purple' },
  '코인': { icon: '🪙', color: 'badge-orange' },
  '기타': { icon: '📦', color: 'badge-muted'  },
}

const BLANK_SAVING = { name: '', category: '적금', amount: '', payment_day: 1, status: 'active', note: '' }

function FixedSavingsTab() {
  const [list, setList]               = useState([])
  const [modal, setModal]             = useState(false)
  const [form, setForm]               = useState(BLANK_SAVING)
  const [editId, setEditId]           = useState(null)
  const [income, setIncome]           = useState(0)
  const [incomeInput, setIncomeInput] = useState('')
  const [editingIncome, setEditingIncome] = useState(false)

  const load = () => getFixedSavings().then(setList).catch(() => {})

  useEffect(() => {
    load()
    getSettings().then(s => {
      setIncome(s.monthly_income || 0)
      setIncomeInput(String(s.monthly_income || ''))
    }).catch(() => {})
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openAdd = () => { setForm(BLANK_SAVING); setEditId(null); setModal(true) }
  const openEdit = (item) => {
    setForm({ ...item, amount: item.amount || '' })
    setEditId(item.id); setModal(true)
  }

  const submit = async () => {
    if (!form.name.trim()) { alert('항목명을 입력하세요'); return }
    if (!form.amount || +form.amount <= 0) { alert('금액을 입력하세요'); return }
    const body = { ...form, amount: +form.amount || 0, payment_day: +form.payment_day || 1 }
    try {
      if (editId) await updateFixedSaving(editId, body)
      else await createFixedSaving(body)
      setModal(false); load()
    } catch { alert('저장 실패') }
  }

  const remove = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    await deleteFixedSaving(id); load()
  }

  const toggleStatus = async (item) => {
    const next = item.status === 'active' ? 'paused' : 'active'
    await updateFixedSaving(item.id, { ...item, status: next }).catch(() => {})
    load()
  }

  const saveIncome = async () => {
    const val = +incomeInput || 0
    try {
      await updateMonthlyIncome(val)
      setIncome(val)
      setEditingIncome(false)
    } catch { alert('저장 실패') }
  }

  const active             = list.filter(r => r.status === 'active')
  const totalMonthlySaving = active.reduce((s, r) => s + (r.amount || 0), 0)
  const savingsRate        = income > 0 ? (totalMonthlySaving / income) * 100 : 0
  const remaining          = Math.max(income - totalMonthlySaving, 0)

  const rateColor = savingsRate >= 30 ? 'txt-s' : savingsRate > 0 && savingsRate < 20 ? 'txt-d' : ''
  const rateMsg   = savingsRate >= 30 ? '🎉 훌륭해요!'
                  : savingsRate >= 20 ? '👍 잘하고 있어요'
                  : savingsRate >  0  ? '💪 더 올려봐요'
                  : income > 0 ? '저축 항목을 추가하세요' : '월급을 입력하세요'
  const barColor  = savingsRate >= 30 ? 'var(--success)' : savingsRate >= 20 ? 'var(--accent)' : 'var(--warning)'

  return (
    <div>
      {/* 요약 카드 3개 */}
      <div className="grid-3">
        <div className="stat-card accent-blue">
          <div className="stat-label">월 저축 합계</div>
          <div className="stat-value">{won(totalMonthlySaving)}</div>
          <div className="stat-sub">활성 {active.length}개 항목</div>
        </div>

        <div className="stat-card accent-green">
          <div className="stat-label">월급 (세후)</div>
          <div className="stat-value" style={{ fontSize: income > 0 ? 22 : 18 }}>
            {editingIncome ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="form-input"
                  type="number"
                  value={incomeInput}
                  onChange={e => setIncomeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveIncome(); if (e.key === 'Escape') setEditingIncome(false) }}
                  style={{ fontSize: 13, padding: '4px 8px', width: 130 }}
                  autoFocus
                />
                <button className="btn btn-primary btn-sm" onClick={saveIncome}>저장</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEditingIncome(false); setIncomeInput(String(income)) }}>취소</button>
              </div>
            ) : (
              <span
                style={{ cursor: isRemoteReadonly ? 'default' : 'pointer', borderBottom: isRemoteReadonly ? 'none' : '2px dashed var(--border)', paddingBottom: 1 }}
                onClick={() => !isRemoteReadonly && setEditingIncome(true)}
                title={isRemoteReadonly ? '' : '클릭하여 수정'}
              >
                {income > 0 ? won(income) : '미입력'}
              </span>
            )}
          </div>
          {!editingIncome && !isRemoteReadonly && (
            <div className="stat-sub" style={{ cursor: 'pointer', color: 'var(--accent)', marginTop: 8 }} onClick={() => setEditingIncome(true)}>
              ✏️ {income > 0 ? '수정하기' : '입력하기'}
            </div>
          )}
        </div>

        <div className="stat-card accent-orange">
          <div className="stat-label">저축률</div>
          <div className={`stat-value ${rateColor}`}>
            {income > 0 ? `${savingsRate.toFixed(1)}%` : '—'}
          </div>
          <div className="stat-sub">{rateMsg}</div>
        </div>
      </div>

      {/* 저축률 시각화 바 */}
      {income > 0 && (
        <div className="section">
          <div className="fs-rate-card">
            <div className="fs-rate-header">
              <span className="fw6" style={{ fontSize: 13 }}>월 소득 배분</span>
              <span className="small txt-m">{won(income)}</span>
            </div>
            <div className="fs-rate-bar-track">
              <div
                className="fs-rate-bar-fill"
                style={{ width: `${Math.min(savingsRate, 100)}%`, background: barColor }}
              />
            </div>
            <div className="fs-rate-legend">
              <div className="fs-rate-legend-item">
                <span className="fs-rate-dot" style={{ background: barColor }} />
                <span>저축 {savingsRate.toFixed(1)}%</span>
                <span className="txt-m">({won(totalMonthlySaving)})</span>
              </div>
              <div className="fs-rate-legend-item">
                <span className="fs-rate-dot" style={{ background: 'var(--surface3)' }} />
                <span>나머지 {(100 - Math.min(savingsRate, 100)).toFixed(1)}%</span>
                <span className="txt-m">({won(remaining)})</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 저축 항목 목록 */}
      <div className="section">
        <div className="section-header">
          <div className="section-title">월 저축 항목</div>
          {!isRemoteReadonly && <button className="btn btn-primary btn-sm" onClick={openAdd}>+ 항목 추가</button>}
        </div>

        {list.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">💰</div>
            <p>등록된 저축 항목이 없습니다</p>
            <p className="small txt-m" style={{ marginTop: 6 }}>적금, 주식 월납입, ETF 등을 직접 추가해보세요</p>
            {!isRemoteReadonly && (
              <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={openAdd}>+ 첫 항목 추가</button>
            )}
          </div>
        ) : (
          <div className="fc-list">
            {list.map(r => {
              const meta = SAVING_CAT_META[r.category] || SAVING_CAT_META['기타']
              return (
                <div key={r.id} className={`fc-item ${r.status !== 'active' ? 'fc-item-paused' : ''}`}>
                  <div className="fc-item-left">
                    <div className="fc-item-name fw6">
                      <span style={{ marginRight: 6 }}>{meta.icon}</span>
                      {r.name}
                      <span className={`badge ${meta.color}`} style={{ marginLeft: 8 }}>{r.category}</span>
                    </div>
                    <div className="fc-item-meta">
                      <span className="fc-meta-chip">매월 {r.payment_day}일</span>
                      {r.note && <span className="txt-m small">{r.note}</span>}
                    </div>
                  </div>
                  <div className="fc-item-right">
                    <div className="fc-item-amount" style={{ color: 'var(--accent)' }}>
                      {won(r.amount)}<span className="fc-per-month">/월</span>
                    </div>
                    {!isRemoteReadonly && (
                      <div className="fc-item-actions">
                        <StatusToggle status={r.status} onChange={() => toggleStatus(r)} />
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>수정</button>
                        <button className="btn btn-danger btn-sm" onClick={() => remove(r.id)}>삭제</button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 추가/수정 모달 */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? '저축 항목 수정' : '저축 항목 추가'}>
        <FormRow>
          <FormGroup label="항목명">
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="예) 카카오뱅크 적금" autoFocus />
          </FormGroup>
          <FormGroup label="종류">
            <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
              {SAVING_CATEGORIES.map(c => <option key={c} value={c}>{SAVING_CAT_META[c]?.icon} {c}</option>)}
            </select>
          </FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="월 납입금 (원)">
            <input className="form-input" type="number" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" />
          </FormGroup>
          <FormGroup label="납입일 (매월)">
            <input className="form-input" type="number" min="1" max="31" value={form.payment_day} onChange={e => set('payment_day', e.target.value)} placeholder="1" />
          </FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup label="상태">
            <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="active">활성</option>
              <option value="paused">일시정지</option>
            </select>
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

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function FixedCosts() {
  const [tab, setTab] = useState('savings')

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h2>고정비용</h2>
          <p>매달 나가는 고정 지출 · 저축을 한눈에 관리하세요</p>
        </div>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn${tab === 'savings' ? ' active' : ''}`} onClick={() => setTab('savings')}>
          💰 고정저축
        </button>
        <button className={`tab-btn${tab === 'costs' ? ' active' : ''}`} onClick={() => setTab('costs')}>
          📋 고정비용
        </button>
      </div>

      {tab === 'savings' ? <FixedSavingsTab /> : <FixedCostsTab />}
    </div>
  )
}
