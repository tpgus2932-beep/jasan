import { useState, createContext, useContext, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Savings from './pages/Savings'
import Overseas from './pages/Overseas'
import ISA from './pages/ISA'
import Crypto from './pages/Crypto'
import RealEstate from './pages/RealEstate'
import Yearly from './pages/Yearly'
import { getSettings, updateSettings } from './api'

export const AppCtx = createContext()

export function useApp() { return useContext(AppCtx) }

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [fx, setFxState] = useState(1350)
  const [theme, setThemeState] = useState(() => localStorage.getItem('theme') || 'light')

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

  const pages = { dashboard: Dashboard, savings: Savings, overseas: Overseas, isa: ISA, crypto: Crypto, realestate: RealEstate, yearly: Yearly }
  const Page = pages[page]

  return (
    <AppCtx.Provider value={{ fx, setFx, theme, toggleTheme }}>
      <div className="app">
        <Sidebar page={page} setPage={setPage} />
        <main className="main">
          <Page onNavigate={setPage} />
        </main>
      </div>
    </AppCtx.Provider>
  )
}
