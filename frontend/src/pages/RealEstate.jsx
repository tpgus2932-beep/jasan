import { useEffect, useState } from 'react'
import Modal, { FormGroup, FormRow } from '../components/Modal'
import { getRealEstate, createRealEstate, updateRealEstate, deleteRealEstate } from '../api'

const won = n => Math.round(n).toLocaleString('ko-KR') + '원'

const TYPES = ['매매', '전세', '월세', '보증금']

const TYPE_BADGE = {
  '매매': 'badge-blue',
  '전세': 'badge-green',
  '월세': 'badge-orange',
  '보증금': 'badge-muted',
}

// 유형별 자산가치 계산
function assetValue(r) {
  if (r.type === '매매') return r.current_value || r.purchase_price || 0
  return r.deposit || 0
}

// 순자산 = 자산가치 - 부채
function netAsset(r) {
  return assetValue(r) - (r.debt || 0)
}

const BLANK = {
  name: '', type: '매매',
  deposit: '', monthly_rent: '', purchase_price: '', current_value: '', debt: '',
  start_date: '', end_date: '', status: 'active', note: '',
}

export default function RealEstate() {
  const [list, setList]     = useState([])
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(BLANK)
  const [editId, setEditId] = useState(null)

  const load = () => getRealEstate().then(setList).catch(() => {})
  useEffect(() => { load() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openAdd = () => { setForm(BLANK); setEditId(null); setModal(true) }
  const openEdit = (item) => {
    setForm({
      ...item,
      deposit: item.deposit || '', monthly_rent: item.monthly_rent || '',
      purchase_price: item.purchase_price || '', current_value: item.current_value || '',
      debt: item.debt || '',
    })
    setEditId(item.id); setModal(true)
  }

  const submit = async () => {
    if (!form.name.trim()) { alert('이름을 입력하세요'); return }
    const body = {
      ...form,
      deposit: +form.deposit || 0, monthly_rent: +form.monthly_rent || 0,
      purchase_price: +form.purchase_price || 0, current_value: +form.current_value || 0,
      debt: +form.debt || 0,
    }
    try {
      if (editId) await updateRealEstate(editId, body)
      else await createRealEstate(body)
      setModal(false); load()
    } catch { alert('저장 실패') }
  }

  const remove = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    await deleteRealEstate(id); load()
  }

  const active = list.filter(r => r.status === 'active')
  const totalAsset = active.reduce((s, r) => s + assetValue(r), 0)
  const totalDebt  = active.reduce((s, r) => s + (r.debt || 0), 0)
  const totalNet   = totalAsset - totalDebt

  return (
    <div className="page-enter">
      <div className="page-header">
        <div><h2>부동산</h2><p>부동산 자산 및 부채 관리</p></div>
        <button className="btn btn-primary" onClick={openAdd}>+ 부동산 추가</button>
      </div>

      <div className="grid-3">
        <div className="stat-card accent-blue">
          <div className="stat-label">총 자산가치</div>
          <div className="stat-value">{won(totalAsset)}</div>
          <div className="stat-sub">{active.length}건 (활성)</div>
        </div>
        <div className="stat-card accent-red">
          <div className="stat-label">총 부채</div>
          <div className="stat-value txt-d">{won(totalDebt)}</div>
          <div className="stat-sub">담보대출 등 합계</div>
        </div>
        <div className={`stat-card ${totalNet >= 0 ? 'accent-green' : 'accent-red'}`}>
          <div className="stat-label">순자산 (자산 - 부채)</div>
          <div className={`stat-value ${totalNet >= 0 ? 'txt-s' : 'txt-d'}`}>{won(totalNet)}</div>
          <div className="stat-sub">
            LTV {totalAsset > 0 ? ((totalDebt / totalAsset) * 100).toFixed(1) : 0}%
          </div>
        </div>
      </div>

      <div className="section">
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>이름 / 주소</th><th>유형</th>
              <th className="num">자산가치</th>
              <th className="num">부채</th>
              <th className="num">순자산</th>
              <th className="num">월세</th>
              <th>기간</th><th>상태</th><th></th>
            </tr></thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={9}>
                  <div className="empty">
                    <div className="empty-icon">🏠</div>
                    <p>등록된 부동산이 없습니다</p>
                  </div>
                </td></tr>
              ) : list.map(r => {
                const av  = assetValue(r)
                const net = netAsset(r)
                const gain = r.type === '매매' && r.purchase_price
                  ? (r.current_value || 0) - r.purchase_price : null

                return (
                  <tr key={r.id}>
                    <td>
                      <div className="fw6">{r.name}</div>
                      {r.type === '매매' && r.purchase_price > 0 && (
                        <div className="small txt-m">취득가 {won(r.purchase_price)}</div>
                      )}
                      {r.note && <div className="small txt-m">{r.note}</div>}
                    </td>
                    <td><span className={`badge ${TYPE_BADGE[r.type]}`}>{r.type}</span></td>
                    <td className="num">
                      <div className="fw7">{won(av)}</div>
                      {gain !== null && (
                        <div className={`small ${gain >= 0 ? 'txt-s' : 'txt-d'}`}>
                          {gain >= 0 ? '+' : ''}{won(gain)}
                        </div>
                      )}
                    </td>
                    <td className="num">
                      {r.debt ? <span className="txt-d">{won(r.debt)}</span> : <span className="txt-m">—</span>}
                    </td>
                    <td className="num">
                      <span className={net >= 0 ? 'txt-s fw7' : 'txt-d fw7'}>{won(net)}</span>
                    </td>
                    <td className="num">
                      {r.monthly_rent > 0
                        ? <span className="txt-w">{won(r.monthly_rent)}/월</span>
                        : <span className="txt-m">—</span>}
                    </td>
                    <td className="txt-m small">
                      {r.start_date && <div>{r.start_date}</div>}
                      {r.end_date && <div>~ {r.end_date}</div>}
                      {!r.start_date && !r.end_date && '—'}
                    </td>
                    <td>
                      <span className={`badge ${r.status === 'active' ? 'badge-blue' : 'badge-muted'}`}>
                        {r.status === 'active' ? '활성' : '종료'}
                      </span>
                    </td>
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

      {/* 유형별 가이드 */}
      <div className="re-guide">
        <div className="re-guide-item">
          <span className={`badge ${TYPE_BADGE['매매']}`}>매매</span>
          <span>현재 시세 기준 자산가치. 담보대출은 부채로 차감</span>
        </div>
        <div className="re-guide-item">
          <span className={`badge ${TYPE_BADGE['전세']}`}>전세</span>
          <span>전세금 전액을 돌려받으므로 전액 자산으로 계산</span>
        </div>
        <div className="re-guide-item">
          <span className={`badge ${TYPE_BADGE['월세']}`}>월세</span>
          <span>반환받는 보증금만 자산으로 계산. 월세는 지출 참고용</span>
        </div>
        <div className="re-guide-item">
          <span className={`badge ${TYPE_BADGE['보증금']}`}>보증금</span>
          <span>반환받는 보증금을 자산으로 계산</span>
        </div>
      </div>

      {/* 모달 */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? '부동산 수정' : '부동산 추가'}>
        <FormRow>
          <FormGroup label="이름 / 주소">
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="예) 서울 아파트" />
          </FormGroup>
          <FormGroup label="유형">
            <select className="form-input" value={form.type} onChange={e => set('type', e.target.value)}>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormGroup>
        </FormRow>

        {/* 매매 */}
        {form.type === '매매' && (
          <FormRow>
            <FormGroup label="취득가 (원)">
              <input className="form-input" type="number" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)} placeholder="0" />
            </FormGroup>
            <FormGroup label="현재 시세 (원)">
              <input className="form-input" type="number" value={form.current_value} onChange={e => set('current_value', e.target.value)} placeholder="0" />
            </FormGroup>
          </FormRow>
        )}

        {/* 전세/월세/보증금 */}
        {form.type !== '매매' && (
          <FormRow>
            <FormGroup label={form.type === '전세' ? '전세금 (원)' : '보증금 (원)'}>
              <input className="form-input" type="number" value={form.deposit} onChange={e => set('deposit', e.target.value)} placeholder="0" />
            </FormGroup>
            {form.type === '월세' && (
              <FormGroup label="월세 (원/월)">
                <input className="form-input" type="number" value={form.monthly_rent} onChange={e => set('monthly_rent', e.target.value)} placeholder="0" />
              </FormGroup>
            )}
          </FormRow>
        )}

        <FormGroup label="부채 (담보대출 등, 원)">
          <input className="form-input" type="number" value={form.debt} onChange={e => set('debt', e.target.value)} placeholder="0" />
        </FormGroup>

        <FormRow>
          <FormGroup label="시작일">
            <input className="form-input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </FormGroup>
          <FormGroup label="종료일 / 만기일">
            <input className="form-input" type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
          </FormGroup>
        </FormRow>

        <FormRow>
          <FormGroup label="상태">
            <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="active">활성</option>
              <option value="ended">종료</option>
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
