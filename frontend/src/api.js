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
      const fx     = rows.find(row => row.key === 'fx')
      const income = rows.find(row => row.key === 'monthly_income')
      return {
        fx: fx ? Number(fx.value) : 1350,
        monthly_income: income ? Number(income.value) : 0,
      }
    })
  : api.get('/settings').then(r => r.data)
export const updateSettings = (data) => isRemoteReadonly ? readonlyReject() : api.put('/settings', data).then(r => r.data)
export const updateMonthlyIncome = (monthly_income) => isRemoteReadonly ? readonlyReject() : api.put('/settings/monthly-income', { monthly_income }).then(r => r.data)
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
export const getShinhanISA = () => isRemoteReadonly ? readTable('shinhan_isa_history', 'date.asc') : api.get('/shinhan-isa').then(r => r.data)
export const createShinhanISA = (data) => isRemoteReadonly ? readonlyReject() : api.post('/shinhan-isa', data).then(r => r.data)
export const deleteShinhanISA = (id) => isRemoteReadonly ? readonlyReject() : api.delete(`/shinhan-isa/${id}`)
export const getShinhanISAHoldings = () => isRemoteReadonly ? readTable('shinhan_isa_holdings') : api.get('/shinhan-isa/holdings').then(r => r.data)
export const createShinhanISAHolding = (data) => isRemoteReadonly ? readonlyReject() : api.post('/shinhan-isa/holdings', data).then(r => r.data)
export const updateShinhanISAHolding = (id, data) => isRemoteReadonly ? readonlyReject() : api.put(`/shinhan-isa/holdings/${id}`, data).then(r => r.data)
export const deleteShinhanISAHolding = (id) => isRemoteReadonly ? readonlyReject() : api.delete(`/shinhan-isa/holdings/${id}`)
export const syncISAFromShinhan = () => isRemoteReadonly ? readonlyReject() : api.post('/shinhan-isa/sync').then(r => r.data)

export const getDainISA = () => isRemoteReadonly ? readTable('dain_isa_history', 'date.asc') : api.get('/dain-isa').then(r => r.data)
export const createDainISA = (data) => isRemoteReadonly ? readonlyReject() : api.post('/dain-isa', data).then(r => r.data)
export const deleteDainISA = (id) => isRemoteReadonly ? readonlyReject() : api.delete(`/dain-isa/${id}`)
export const getDainISAHoldings = () => isRemoteReadonly ? readTable('dain_isa_holdings') : api.get('/dain-isa/holdings').then(r => r.data)
export const createDainISAHolding = (data) => isRemoteReadonly ? readonlyReject() : api.post('/dain-isa/holdings', data).then(r => r.data)
export const updateDainISAHolding = (id, data) => isRemoteReadonly ? readonlyReject() : api.put(`/dain-isa/holdings/${id}`, data).then(r => r.data)
export const deleteDainISAHolding = (id) => isRemoteReadonly ? readonlyReject() : api.delete(`/dain-isa/holdings/${id}`)
export const syncDainISAFromKiwoom = () => isRemoteReadonly ? readonlyReject() : api.post('/dain-isa/sync-kiwoom').then(r => r.data)

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

export const migrateYearlyToMonthly = () => isRemoteReadonly ? readonlyReject() : api.post('/migrate/yearly-to-monthly').then(r => r.data)

export const getFixedCosts = () => isRemoteReadonly ? readTable('fixed_costs') : api.get('/fixed-costs').then(r => r.data)
export const createFixedCost = (data) => isRemoteReadonly ? readonlyReject() : api.post('/fixed-costs', data).then(r => r.data)
export const updateFixedCost = (id, data) => isRemoteReadonly ? readonlyReject() : api.put(`/fixed-costs/${id}`, data).then(r => r.data)
export const deleteFixedCost = (id) => isRemoteReadonly ? readonlyReject() : api.delete(`/fixed-costs/${id}`)

export const getFixedSavings = () => isRemoteReadonly ? readTable('fixed_savings') : api.get('/fixed-savings').then(r => r.data)
export const createFixedSaving = (data) => isRemoteReadonly ? readonlyReject() : api.post('/fixed-savings', data).then(r => r.data)
export const updateFixedSaving = (id, data) => isRemoteReadonly ? readonlyReject() : api.put(`/fixed-savings/${id}`, data).then(r => r.data)
export const deleteFixedSaving = (id) => isRemoteReadonly ? readonlyReject() : api.delete(`/fixed-savings/${id}`)

export const getPortfolioTemplates = () => isRemoteReadonly ? readTable('portfolio_templates') : api.get('/portfolio-templates').then(r => r.data)
export const createPortfolioTemplate = (data) => isRemoteReadonly ? readonlyReject() : api.post('/portfolio-templates', data).then(r => r.data)
export const updatePortfolioTemplate = (id, data) => isRemoteReadonly ? readonlyReject() : api.put(`/portfolio-templates/${id}`, data).then(r => r.data)
export const deletePortfolioTemplate = (id) => isRemoteReadonly ? readonlyReject() : api.delete(`/portfolio-templates/${id}`)

export const getPortfolioCategories = (templateId) => isRemoteReadonly
  ? readTable('portfolio_categories', 'order_idx.asc', { template_id: `eq.${templateId}` })
  : api.get(`/portfolio-templates/${templateId}/categories`).then(r => r.data)
export const createPortfolioCategory = (templateId, data) => isRemoteReadonly ? readonlyReject() : api.post(`/portfolio-templates/${templateId}/categories`, data).then(r => r.data)
export const updatePortfolioCategory = (id, data) => isRemoteReadonly ? readonlyReject() : api.put(`/portfolio-categories/${id}`, data).then(r => r.data)
export const deletePortfolioCategory = (id) => isRemoteReadonly ? readonlyReject() : api.delete(`/portfolio-categories/${id}`)

export const getPortfolioAllocations = (templateId) => isRemoteReadonly
  ? readTable('portfolio_allocations', null, { template_id: `eq.${templateId}` })
  : api.get(`/portfolio-templates/${templateId}/allocations`).then(r => r.data)
export const savePortfolioAllocations = (templateId, allocations) => isRemoteReadonly ? readonlyReject() : api.put(`/portfolio-templates/${templateId}/allocations`, { allocations }).then(r => r.data)
export const recordRebalance = (templateId, date) => isRemoteReadonly ? readonlyReject() : api.post(`/portfolio-templates/${templateId}/rebalance`, { date }).then(r => r.data)

export const getTickerInfo = (tickers) => api.post('/ticker-info', { tickers }).then(r => r.data)
export const runBacktest = (payload) => api.post('/backtest', payload).then(r => r.data)

export const getMonthly = () => isRemoteReadonly ? readTable('monthly_records', 'year_month.asc') : api.get('/monthly').then(r => r.data)
export const createMonthly = (data) => isRemoteReadonly ? readonlyReject() : api.post('/monthly', data).then(r => r.data)
export const updateMonthly = (id, data) => isRemoteReadonly ? readonlyReject() : api.put(`/monthly/${id}`, data).then(r => r.data)
export const deleteMonthly = (id) => isRemoteReadonly ? readonlyReject() : api.delete(`/monthly/${id}`)
