import { useState, createContext, useContext, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Savings from './pages/Savings'
import Overseas from './pages/Overseas'
import ISA from './pages/ISA'
import Crypto from './pages/Crypto'
import RealEstate from './pages/RealEstate'
import Monthly from './pages/Monthly'
import Yearly from './pages/Yearly'
import { getSettings, hasRemoteSession, isRemoteReadonly, remoteLogin, remoteLogout, updateSettings } from './api'

export const AppCtx = createContext()

export function useApp() { return useContext(AppCtx) }

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [fx, setFxState] = useState(1350)
  const [theme, setThemeState] = useState(() => localStorage.getItem('theme') || 'light')
  const [remoteAuthed, setRemoteAuthed] = useState(() => hasRemoteSession())

  useEffect(() => {
    getSettings().then(s => setFxState(s.fx)).catch(() => {})
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const setFx = (val) => {
    setFxState(val)
    updateSettings({ fx: val }).catch(() => {})
  }

  const toggleTheme = () => setThemeState(t => t === 'light' ? 'dark' : 'light')

  const pages = { dashboard: Dashboard, savings: Savings, overseas: Overseas, isa: ISA, crypto: Crypto, realestate: RealEstate, monthly: Monthly, yearly: Yearly }
  const Page = pages[page]

  if (isRemoteReadonly && !remoteAuthed) {
    return (
      <RemoteLogin
        theme={theme}
        toggleTheme={toggleTheme}
        onLogin={() => setRemoteAuthed(true)}
      />
    )
  }

  return (
    <AppCtx.Provider value={{ fx, setFx, theme, toggleTheme }}>
      <div className="app">
        <Sidebar page={page} setPage={setPage} />
        <main className="main">
          {isRemoteReadonly && (
            <div className="readonly-bar">
              Vercel 보기 전용
              <button className="btn btn-ghost btn-sm" onClick={() => { remoteLogout(); setRemoteAuthed(false) }}>로그아웃</button>
            </div>
          )}
          <Page onNavigate={setPage} />
        </main>
      </div>
    </AppCtx.Provider>
  )
}

function RemoteLogin({ theme, toggleTheme, onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await remoteLogin(email, password)
      onLogin()
    } catch {
      alert('로그인 실패: Supabase Auth 계정 정보를 확인하세요')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div>
          <h1>자산관리</h1>
          <p>Supabase 계정으로 로그인하세요.</p>
        </div>
        <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일" required />
        <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호" required />
        <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? '로그인 중...' : '로그인'}</button>
        <button className="theme-toggle" type="button" onClick={toggleTheme}>
          {theme === 'light' ? '다크 모드' : '라이트 모드'}
        </button>
      </form>
    </div>
  )
}
