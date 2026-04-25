import { useEffect, useState } from 'react'
import { getMonthly } from '../api'

const won = n => Math.round(n).toLocaleString('ko-KR') + '원'
const pct = n => (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'

const BAR_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#94a3b8']
const BAR_KEYS   = ['savings', 'overseas', 'isa', 'crypto', 'real_estate', 'other']
const BAR_LABELS = ['적금', '해외직투', 'ISA', '코인', '부동산', '기타']

function MiniBar({ r }) {
  const vals = BAR_KEYS.map(k => Math.max(r[k] || 0, 0))
  const sum  = vals.reduce((a, b) => a + b, 0)
  if (!sum) return <span className="txt-m">—</span>
  return (
    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', minWidth: 80, gap: 1 }}
         title={BAR_KEYS.map((k, i) => `${BAR_LABELS[i]}: ${Math.round((vals[i]/sum)*100)}%`).filter((_, i) => vals[i] > 0).join(' / ')}>
      {vals.map((v, i) => v > 0
        ? <div key={i} style={{ flex: v, background: BAR_COLORS[i] }} />
        : null
      )}
    </div>
  )
}

function totalInv(r) {
  return (r.inv_savings||0)+(r.inv_overseas||0)+(r.inv_isa||0)+(r.inv_crypto||0)+(r.inv_real_estate||0)
}

function deriveYearly(monthly) {
  const byYear = {}
  const sorted = [...monthly].sort((a, b) => a.year_month.localeCompare(b.year_month))
  for (const r of sorted) {
    const year = r.year_month.slice(0, 4)
    if (!byYear[year]) byYear[year] = r
  }
  return Object.values(byYear).sort((a, b) => a.year_month.localeCompare(b.year_month))
}

export default function Yearly() {
  const [monthly, setMonthly] = useState([])

  useEffect(() => { getMonthly().then(setMonthly).catch(() => {}) }, [])

  const rows = deriveYearly(monthly)

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h2>연간기록</h2>
          <p>월간기록에서 연도별 첫 번째 달 자동 파생 · 카테고리별 순수 수익률</p>
        </div>
      </div>

      {rows.length >= 2 && (() => {
        const prev = rows[rows.length - 2]
        const cur  = rows[rows.length - 1]
        const growthAmt  = cur.total - prev.total
        const growthRate = prev.total > 0 ? growthAmt / prev.total * 100 : null
        const invTotal   = totalInv(cur)
        const pureRate   = prev.total > 0 && invTotal > 0 ? (growthAmt - invTotal) / prev.total * 100 : null
        return (
          <div className={`alert ${growthRate >= 0 ? 'alert-success' : 'alert-danger'}`}>
            <span>{growthRate >= 0 ? '📈' : '📉'}</span>
            <span>
              {prev.year_month} → {cur.year_month} 총 증감{' '}
              <strong>{growthRate !== null ? pct(growthRate) : '—'}</strong>
              {pureRate !== null && (
                <> · 순수 수익률 <strong>{pct(pureRate)}</strong>
                  <span style={{ opacity: 0.7 }}> (추가투자 {won(invTotal)} 제외)</span>
                </>
              )}
            </span>
          </div>
        )
      })()}

      <div className="section">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📅</div>
            <p><strong>월간기록</strong>을 추가하면 연도별 첫 번째 달이 여기에 자동으로 표시됩니다.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>연도 (기준월)</th>
                <th>구성</th>
                <th className="num">적금</th>
                <th className="num">해외직투</th>
                <th className="num">ISA</th>
                <th className="num">코인</th>
                <th className="num">부동산</th>
                <th className="num">기타</th>
                <th className="num">총 자산</th>
                <th className="num">추가투자</th>
                <th className="num">전년 증감</th>
                <th className="num">총 증감률</th>
                <th className="num">순수 수익률</th>
                <th>메모</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const prev       = i > 0 ? rows[i - 1] : null
                  const changeAmt  = prev ? r.total - prev.total : null
                  const changeRate = prev && prev.total > 0 ? (r.total - prev.total) / prev.total * 100 : null
                  const invTotal   = totalInv(r)
                  const pureAmt    = changeAmt !== null ? changeAmt - invTotal : null
                  const pureRate   = prev && prev.total > 0 && invTotal > 0 ? pureAmt / prev.total * 100 : null
                  const year       = r.year_month.slice(0, 4)
                  return (
                    <tr key={r.id}>
                      <td>
                        <strong>{year}년</strong>
                        <span className="txt-m" style={{ marginLeft: 6, fontSize: 11 }}>({r.year_month})</span>
                      </td>
                      <td style={{ minWidth: 90 }}><MiniBar r={r} /></td>
                      <td className="num">{won(r.savings      || 0)}</td>
                      <td className="num">{won(r.overseas     || 0)}</td>
                      <td className="num">{won(r.isa          || 0)}</td>
                      <td className="num">{won(r.crypto       || 0)}</td>
                      <td className="num">{won(r.real_estate  || 0)}</td>
                      <td className="num txt-m">{won(r.other  || 0)}</td>
                      <td className="num fw7">{won(r.total)}</td>
                      <td className="num txt-m">
                        {invTotal > 0
                          ? <span title={`적금 ${won(r.inv_savings||0)} / 해외 ${won(r.inv_overseas||0)} / ISA ${won(r.inv_isa||0)} / 코인 ${won(r.inv_crypto||0)} / 부동산 ${won(r.inv_real_estate||0)}`}>
                              {won(invTotal)}
                            </span>
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
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.5, textAlign: 'right' }}>
          연간기록은 월간기록에서 연도별 가장 이른 달을 자동으로 가져옵니다. 수정은 월간기록 페이지에서 하세요.
        </div>
      </div>
    </div>
  )
}
