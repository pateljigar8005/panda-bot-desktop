// ---------- Shared ----------
export interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

// ---------- Accounts ----------
/**
 * 'inactive' = turned off by the user; 'on_hold' = paused automatically after too many failed heartbeats
 * in a row. Neither sends heartbeats or bets until activated again.
 */
export type AccountStatus = 'active' | 'inactive' | 'on_hold' | 'expired' | 'banned'
export type BetMode = 'fixed' | 'proportional'
export type DeviceId = '1' | '2'

export interface Account {
  _id: string
  name: string
  uid: string
  deviceId: DeviceId
  /** Only on GET /accounts/:id (for the edit form). Null for accounts saved before it was stored. */
  tokenUrl?: string | null
  /** Masked by the server (never sent in the clear) — see accountJSON. */
  token: string
  sessionId: string
  sid: string | null
  mc: string | null
  /** Why fetching mc from the platform failed; null once it succeeds. Without sid/mc there are no heartbeats. */
  setupError?: string | null
  /** Why / when it was put on hold (status 'on_hold'). */
  holdReason?: string | null
  heldAt?: string | null
  mId?: string
  betMode: BetMode
  fixedAmount: number
  multiplier: number
  maxBetAmount: number
  minBalanceThreshold: number
  proxyId?: string | null
  /** Last time a platform request for this account went through its current proxy. */
  proxyLastUsedAt?: string | null
  status: AccountStatus
  lastHeartbeatAt?: string
  lastBalance: number
  /** Every failed heartbeat since the log was last cleared (matches the log). Reset only by Clear log. */
  heartbeatErrors: number
  /** Current failure streak; 0 after any successful heartbeat. Drives auto-hold. */
  consecutiveFailures?: number
  totalBetsPlaced: number
  notes?: string
  createdAt: string
  updatedAt: string
}

/** Body for POST /accounts (create) and PUT /accounts/:id (all optional on update). */
export interface AccountInput {
  name: string
  /** Required on create. On update, omit to keep the current token. */
  tokenUrl?: string
  deviceId: DeviceId
  betMode: BetMode
  fixedAmount?: number
  multiplier?: number
  maxBetAmount: number
  minBalanceThreshold: number
  proxyId?: string | null
  notes?: string
}

export interface AccountListParams {
  page?: number
  limit?: number
  status?: AccountStatus
  search?: string
}

/** One heartbeat attempt (GET /accounts/:id/heartbeat-logs). Kept 7 days. */
export interface HeartbeatLog {
  _id: string
  accountId: string
  accountName?: string
  /** 'setup' = a sid/mc lookup (create, token change, retry). Older entries have no value (= heartbeat). */
  event?: 'heartbeat' | 'setup'
  /** Platform domain the request went to (it rotates), e.g. https://api.3qttu0s.com. Older entries: null. */
  apiBase?: string | null
  /** Platform endpoint, e.g. /yewu40/req/request */
  endpoint?: string | null
  success: boolean
  /** HTTP status from the platform (absent when the request never got a response). */
  statusCode?: number
  /** Platform result code, e.g. "0000000" = OK, "0401013" = token expired. */
  responseCode?: string
  latencyMs?: number
  errorMessage?: string | null
  /** Request sent, with secrets (sessionId/sid/code/sign) redacted. */
  requestPayload?: Record<string, unknown> | null
  responseBody?: unknown
  createdAt: string
}

export type HeartbeatLogSort = 'newest' | 'oldest' | 'slowest'

export interface HeartbeatLogParams {
  /** Time window in minutes (server caps at 7 days; default 24h). */
  rangeMinutes?: number
  /** Only heartbeats, or only setup attempts; omitted = both. */
  event?: 'heartbeat' | 'setup'
  /** true = successes only, false = failures only, omitted = all. */
  success?: boolean
  /** Platform result code; 'none' = entries without one (network / proxy / timeout errors). */
  code?: string
  /** Only requests sent to this platform domain. */
  apiBase?: string
  /** Case-insensitive search in the error message. */
  q?: string
  sort?: HeartbeatLogSort
  page?: number
  limit?: number
}

export interface HeartbeatLogPage {
  logs: HeartbeatLog[]
  pagination: Pagination
  /** For the whole time window (not affected by the status/code/search filters). */
  stats: HeartbeatStats
  /** Codes seen in the time window, for the code filter. */
  codes: string[]
  /** Platform domains used in the time window, for the domain filter. */
  domains: string[]
  rangeMinutes: number
  sort: HeartbeatLogSort
}

/** GET /heartbeat-logs params (Live Monitor): same as HeartbeatLogParams, across every account. */
export interface ActivityLogParams extends HeartbeatLogParams {
  accountId?: string
}

/** GET /heartbeat-logs response: same as HeartbeatLogPage plus which accounts appear in the window. */
export interface ActivityLogPage extends HeartbeatLogPage {
  accounts: { accountId: string; accountName: string | null }[]
}

export interface HeartbeatStats {
  total: number
  success: number
  failed: number
  avgLatency: number | null
}

export interface AccountTestResult {
  success: boolean
  latencyMs: number
  message: string
}

// ---------- Proxies ----------
export type ProxyStatus = 'healthy' | 'dead' | 'unknown'
export type ProxyProtocol = 'http' | 'https' | 'socks5'

export interface Proxy {
  _id: string
  name: string
  provider?: string
  host: string
  port: number
  username?: string
  passwordEncrypted: string | null
  protocol: ProxyProtocol
  country?: string
  status: ProxyStatus
  lastCheck?: string
  notes?: string
  /** Number of the user's accounts using this proxy (list endpoint only). */
  accountCount?: number
  createdAt: string
  updatedAt: string
}

/** An account as listed under a proxy (GET /proxies/:id/accounts). */
export type ProxyAccount = Pick<Account, '_id' | 'name' | 'uid' | 'status' | 'deviceId' | 'lastHeartbeatAt' | 'heartbeatErrors' | 'consecutiveFailures' | 'proxyLastUsedAt'>

export interface ProxyInput {
  name: string
  provider?: string
  host: string
  port: number
  username?: string
  password?: string
  protocol: ProxyProtocol
  country?: string
  notes?: string
}

export interface ProxyListParams {
  page?: number
  limit?: number
  status?: ProxyStatus
  search?: string
}

export interface ProxyHealthResult {
  success: boolean
  status: ProxyStatus
  latencyMs: number
  ip: string
}

// ---------- Master account ----------
export interface MasterAccount {
  _id: string
  name: string
  uid: string
  deviceId: DeviceId
  /** Decrypted, for the edit form. Null for master accounts saved before it was stored. */
  tokenUrl?: string | null
  status: 'active' | 'paused' | 'expired'
  lastBetAt?: string
  notes?: string
  createdAt: string
}

export interface MasterInput {
  name: string
  /** Required on create. On update, omit to keep the current token. */
  tokenUrl?: string
  deviceId: DeviceId
  notes?: string
}

export interface MasterStatus {
  running: boolean
  lastBetAt?: string
  status: string
}

// ---------- Bets / audit / realtime (later phases) ----------
export type BetStatus = 'captured' | 'executed' | 'failed' | 'skipped'

export interface BetLog {
  id: string
  accountId: string
  accountUsername?: string
  event: string
  market: string
  selection: string
  odds: number
  stake: number
  status: BetStatus
  error?: string | null
  capturedAt: string
  executedAt: string | null
}
/** One state-changing request (GET /audit-logs). Append-only. */
export interface AuditLog {
  _id: string
  action: string
  ip: string | null
  userAgent: string | null
  method: string | null
  /** Route pattern, e.g. /api/accounts/:id */
  path: string | null
  statusCode: number | null
  success: boolean
  /** The API's error message when the request failed. */
  message: string | null
  resourceType: 'account' | 'proxy' | 'master' | 'settings' | 'user' | string | null
  resourceId: string | null
  resourceName: string | null
  durationMs: number | null
  /** Request body with secrets redacted. */
  request: unknown
  meta: Record<string, unknown>
  createdAt: string
}

export type AuditSortField = 'createdAt' | 'action' | 'resource' | 'status' | 'duration' | 'ip'

export interface AuditLogParams {
  action?: string
  success?: boolean
  from?: string
  to?: string
  q?: string
  // Advanced search
  resourceType?: string
  resourceName?: string
  ip?: string
  method?: string
  statusCode?: number
  message?: string
  sort?: AuditSortField
  order?: 'asc' | 'desc'
  page?: number
  limit?: number
}

export interface AuditLogFilters {
  actions: string[]
}

export const SOCKET_EVENTS = [
  'heartbeat:update',
  'bet:captured',
  'bet:executed',
  'balance:update',
  'account:status',
  'system:alert',
  'kill-switch:activated',
] as const

export type SocketEventName = (typeof SOCKET_EVENTS)[number]

// ---------- System (automation settings + kill switch) ----------
export interface SystemSettings {
  heartbeatIntervalMs: number
  heartbeatJitterMs: number
  /** Put an account on hold after this many failed heartbeats in a row (0 = never). */
  autoHoldAfterFailures: number
  /** Enforced by the bet executor (Phase 3). */
  maxConcurrentBetsPerAccount: number
  /** null = no limit. Enforced by the bet executor (Phase 3). */
  dailyLossLimit: number | null
}

export interface KillSwitchState {
  active: boolean
  reason: string | null
  activatedAt: string | null
  releasedAt: string | null
}

export interface SystemStatus {
  settings: SystemSettings
  killSwitch: KillSwitchState
  runningHeartbeats: number
}

export interface KillSwitchResult extends SystemStatus {
  stoppedHeartbeats?: number
  clearedQueues?: string[]
  restartedHeartbeats?: number
  /** e.g. Redis unreachable: heartbeats are still stopped in the server. */
  warnings: string[]
}
