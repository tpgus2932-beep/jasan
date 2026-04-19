import { useEffect, useState } from 'react'
import { getCryptoHoldings, getCryptoHistory, isRemoteReadonly, syncCryptoFromUpbit } from '../api'

const won = n => Math.round(Number(n) || 0).toLocaleString('ko-KR') + '원'
const qty = n => Number(n || 0).toLocaleString('ko-KR', { maximumFractionDigits: 8 })

export default function Crypto() {
  const [holdings, setHoldings] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = () => {
    getCryptoHoldings().then(setHoldings).catch(() => {})
    getCryptoHistory().then(setHistory).catch(() => {})
  }

  useEffect(() => { load() }, [])

  const total = holdings.reduce((sum, h) => sum + (h.value || 0), 0)
  const profit = holdings.reduce((sum, h) => sum + (h.profit || 0), 0)
  const latest = history.length ? history[history.length - 1] : null
  const prev = history.length > 1 ? history[history.length - 2] : null
  const change = latest && prev ? latest.value - prev.value : null

  const sync = async () => {
    setLoading(true)
    try {
      const data = await syncCryptoFromUpbit()
      setLastUpdated(new Date().toLocaleTimeString('ko-KR'))
      load()
      alert(`업비트 동기화 완료: ${data.count}개 코인, ${won(data.value)}`)
    } catch (e) {
      alert(e.response?.data?.detail || '업비트 동기화 실패: backend/.env의 업비트 API 키와 IP 허용 목록을 확인하세요')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <div><h2>코인</h2><p>업비트 보유 코인 · 원화 평가액</p></div>
        {!isRemoteReadonly && (
          <button className="btn btn-primary" onClick={sync} disabled={loading}>
            {loading ? '업비트 조회 중...' : '업비트에서 가져오기'}
          </button>
        )}
      </div>

      <div className="grid-3">
        <div className="stat-card accent-blue">
          <div className="stat-label">코인 평가금액</div>
          <div className="stat-value">{won(total)}</div>
          <div className="stat-sub">{holdings.length}개 코인{lastUpdated ? ` · ${lastUpdated} 갱신` : ''}</div>
        </div>
        <div className="stat-card accent-green">
          <div className="stat-label">평가손익</div>
          <div className={`stat-value ${profit >= 0 ? 'txt-s' : 'txt-d'}`}>{profit >= 0 ? '+' : ''}{won(profit)}</div>
          <div className="stat-sub">평균매수가 기준</div>
        </div>
        <div className="stat-card accent-gray">
          <div className="stat-label">이전 기록 대비</div>
          <div className={`stat-value ${change === null ? '' : change >= 0 ? 'txt-s' : 'txt-d'}`}>
            {change !== null ? `${change >= 0 ? '+' : ''}${won(change)}` : '-'}
          </div>
          <div className="stat-sub">{latest ? `${latest.date} 기준` : '기록 없음'}</div>
        </div>
      </div>

      <div className="section">
        <div className="section-header"><div className="section-title">업비트 보유 코인</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>마켓</th><th>코인</th><th className="num">보유수량</th>
              <th className="num">현재가</th><th className="num">평가금액</th>
              <th className="num">평균매수가</th><th className="num">평가손익</th>
            </tr></thead>
            <tbody>
              {holdings.length === 0 ? (
                <tr><td colSpan={7}>
                  <div className="empty"><div className="empty-icon">₿</div><p>업비트에서 가져온 코인 기록이 없습니다</p></div>
                </td></tr>
              ) : holdings.map(h => (
                <tr key={h.id}>
                  <td><strong>{h.market}</strong></td>
                  <td>{h.currency}</td>
                  <td className="num">{qty((h.balance || 0) + (h.locked || 0))}</td>
                  <td className="num">{won(h.price)}</td>
                  <td className="num fw7">{won(h.value)}</td>
                  <td className="num">{h.avg_buy_price ? won(h.avg_buy_price) : '-'}</td>
                  <td className={`num ${h.profit >= 0 ? 'txt-s' : 'txt-d'}`}>{h.profit >= 0 ? '+' : ''}{won(h.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <div className="section-header"><div className="section-title">동기화 이력</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>기록일</th><th className="num">코인 평가금액</th><th className="num">KRW 예수금</th><th>메모</th></tr></thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={4}><div className="empty"><p>동기화 이력이 없습니다</p></div></td></tr>
              ) : [...history].reverse().map(r => (
                <tr key={r.id}>
                  <td className="txt-m">{r.date}</td>
                  <td className="num fw7">{won(r.value)}</td>
                  <td className="num">{won(r.krw_cash || 0)}</td>
                  <td className="txt-m">{r.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
