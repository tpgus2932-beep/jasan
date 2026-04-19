import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname)
export const isRemoteReadonly = !isLocalHost && Boolean(supabaseUrl && supabaseAnonKey)
export const READONLY_MESSAGE = 'Vercel 배포 환경은 보기 전용입니다. 수정/동기화는 로컬에서만 실행하세요.'

const SESSION_KEY = 'asset_manager_supabase_session'
export const getRemoteSession = () => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}
export const hasRemoteSession = () => !isRemoteReadonly || Boolean(getRemoteSession()?.access_token)

const supabase = isRemoteReadonly
  ? axios.create({
      baseURL: `${supabaseUrl.replace(/\/$/, '')}/rest/v1`,
      headers: {
        apikey: supabaseAnonKey,
      },
    })
  : null

if (supabase) {
  supabase.interceptors.request.use(config => {
    const token = getRemoteSession()?.access_token || supabaseAnonKey
    config.headers.Authorization = `Bearer ${token}`
    return config
  })
}

export const remoteLogin = async (email, password) => {
  const auth = axios.create({
    baseURL: `${supabaseUrl.replace(/\/$/, '')}/auth/v1`,
    headers: { apikey: supabaseAnonKey, 'Content-Type': 'application/json' },
  })
  const { data } = await auth.post('/token?grant_type=password', { email, password })
  localStorage.setItem(SESSION_KEY, JSON.stringify(data))
  return data
}

export const remoteLogout = () => {
  localStorage.removeItem(SESSION_KEY)
}

const readonlyReject = () => Promise.reject(new Error(READONLY_MESSAGE))

const readTable = (table, order = null, params = {}) => {
  if (!isRemoteReadonly) return null
  const query = { select: '*', ...params }
  if (order) query.order = order
  return supabase.get(`/${table}`, { params: query }).then(r => r.data)
}

export const getSettings = () => isRemoteReadonly
  ? readTable('settings').then(rows => {
      const fx = rows.find(row => row.key === 'fx')
      return { fx: fx ? Number(fx.value) : 1350 }
    })
  : api.get('/settings').then(r => r.data)
export const updateSettings = (data) => isRemoteReadonly ? readonlyReject() : api.put('/settings', data).then(r => r.data)
export const fetchFxRate = () => isRemoteReadonly ? readonlyReject() : api.get('/fx-rate').then(r => r.data)
export const fetchStockPrice = (ticker) => isRemoteReadonly ? readonlyReject() : api.get(`/stock-price/${ticker}`).then(r => r.data)
export const fetchStockPrices = (tickers) => isRemoteReadonly ? readonlyReject() : api.post('/stock-prices', { tickers }).then(r => r.data)

export const getSavings = () => isRemoteReadonly ? readTable('savings') : api.get('/savings').then(r => r.data)
export const createSaving = (data) => isRemoteReadonly ? readonlyReject() : api.post('/savings', data).then(r => r.data)
export const updateSaving = (id, data) => isRemoteReadonly ? readonlyReject() : api.put(`/savings/${id}`, data).then(r => r.data)
export const deleteSaving = (id) => isRemoteReadonly ? readonlyReject() : api.delete(`/savings/${id}`)

export const getHoldings = () => isRemoteReadonly ? readTable('overseas_holdings') : api.get('/overseas/holdings').then(r => r.data)
export const createHolding = (data) => isRemoteReadonly ? readonlyReject() : api.post('/overseas/holdings', data).then(r => r.data)
export const updateHolding = (id, data) => isRemoteReadonly ? readonlyReject() : api.put(`/overseas/holdings/${id}`, data).then(r => r.data)
export const deleteHolding = (id) => isRemoteReadonly ? readonlyReject() : api.delete(`/overseas/holdings/${id}`)

export const getRebalHistory = () => isRemoteReadonly ? readTable('rebal_history', 'date.desc') : api.get('/overseas/rebalancing').then(r => r.data)
export const createRebal = (data) => isRemoteReadonly ? readonlyReject() : api.post('/overseas/rebalancing', data).then(r => r.data)
export const deleteRebal = (id) => isRemoteReadonly ? readonlyReject() : api.delete(`/overseas/rebalancing/${id}`)

export const getISA = () => isRemoteReadonly ? readTable('isa_history', 'date.asc') : api.get('/isa').then(r => r.data)
export const createISA = (data) => isRemoteReadonly ? readonlyReject() : api.post('/isa', data).then(r => r.data)
export const deleteISA = (id) => isRemoteReadonly ? readonlyReject() : api.delete(`/isa/${id}`)
export const getISAHoldings = () => isRemoteReadonly ? readTable('isa_holdings') : api.get('/isa/holdings').then(r => r.data)
export const createISAHolding = (data) => isRemoteReadonly ? readonlyReject() : api.post('/isa/holdings', data).then(r => r.data)
export const updateISAHolding = (id, data) => isRemoteReadonly ? readonlyReject() : api.put(`/isa/holdings/${id}`, data).then(r => r.data)
export const deleteISAHolding = (id) => isRemoteReadonly ? readonlyReject() : api.delete(`/isa/holdings/${id}`)
export const syncISAFromKiwoom = () => isRemoteReadonly ? readonlyReject() : api.post('/isa/sync-kiwoom').then(r => r.data)

export const getCryptoHoldings = () => isRemoteReadonly ? readTable('crypto_holdings', 'value.desc') : api.get('/crypto/holdings').then(r => r.data)
export const getCryptoHistory = () => isRemoteReadonly ? readTable('crypto_history', 'date.asc') : api.get('/crypto/history').then(r => r.data)
export const syncCryptoFromUpbit = () => isRemoteReadonly ? readonlyReject() : api.post('/crypto/sync-upbit').then(r => r.data)

export const getRealEstate = () => isRemoteReadonly ? readTable('real_estate') : api.get('/real-estate').then(r => r.data)
export const createRealEstate = (data) => isRemoteReadonly ? readonlyReject() : api.post('/real-estate', data).then(r => r.data)
export const updateRealEstate = (id, data) => isRemoteReadonly ? readonlyReject() : api.put(`/real-estate/${id}`, data).then(r => r.data)
export const deleteRealEstate = (id) => isRemoteReadonly ? readonlyReject() : api.delete(`/real-estate/${id}`)

export const getYearly = () => isRemoteReadonly ? readTable('yearly_records', 'year.asc') : api.get('/yearly').then(r => r.data)
export const createYearly = (data) => isRemoteReadonly ? readonlyReject() : api.post('/yearly', data).then(r => r.data)
export const updateYearly = (id, data) => isRemoteReadonly ? readonlyReject() : api.put(`/yearly/${id}`, data).then(r => r.data)
export const deleteYearly = (id) => isRemoteReadonly ? readonlyReject() : api.delete(`/yearly/${id}`)
