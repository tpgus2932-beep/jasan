import { useApp } from '../App'

const MENU = [
  { id: 'dashboard', icon: '▦',  label: '대시보드' },
  { id: 'savings',   icon: '🏦', label: '적금' },
  { id: 'overseas',  icon: '🌐', label: '해외직투' },
  { id: 'isa',       icon: '📈', label: '키움 ISA' },
  { id: 'crypto',    icon: '₿',  label: '코인' },
  { id: 'realestate',icon: '🏠', label: '부동산' },
  { id: 'yearly',    icon: '📅', label: '연간기록' },
]

const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

export default function Sidebar({ page, setPage }) {
  const { theme, toggleTheme } = useApp()

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <h1>자산관리</h1>
        <p>{today}</p>
      </div>
      <div className="nav-section">
        <div className="nav-label">메뉴</div>
        {MENU.map(m => (
          <div
            key={m.id}
            className={`nav-item${page === m.id ? ' active' : ''}`}
            onClick={() => setPage(m.id)}
          >
            <span className="nav-icon">{m.icon}</span>
            {m.label}
          </div>
        ))}
      </div>
      <div className="sidebar-bottom">
        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === 'light' ? '🌙 다크 모드' : '☀️ 라이트 모드'}
        </button>
      </div>
    </nav>
  )
}
