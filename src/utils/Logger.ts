/**
 * コンソールログ自動記録システム
 *
 * すべてのconsole.log/warn/errorを自動的にキャプチャし、
 * localStorageに保存してダウンロード可能にします
 */

interface LogEntry {
  timestamp: string
  level: 'log' | 'warn' | 'error' | 'info'
  message: string
}

class ConsoleLogger {
  private logs: LogEntry[] = []
  private maxLogs = 1000 // 最大ログ保持数
  private storageKey = 'rpg_game_console_logs'

  // 元のconsoleメソッドを保存
  private originalLog = console.log
  private originalWarn = console.warn
  private originalError = console.error
  private originalInfo = console.info

  constructor() {
    this.loadLogsFromStorage()
  }

  /**
   * コンソールログの自動記録を開始
   */
  startCapture(): void {
    console.log('[Logger] Starting console capture...')

    console.log = (...args: unknown[]) => {
      this.addLog('log', args)
      this.originalLog.apply(console, args)
    }

    console.warn = (...args: unknown[]) => {
      this.addLog('warn', args)
      this.originalWarn.apply(console, args)
    }

    console.error = (...args: unknown[]) => {
      this.addLog('error', args)
      this.originalError.apply(console, args)
    }

    console.info = (...args: unknown[]) => {
      this.addLog('info', args)
      this.originalInfo.apply(console, args)
    }
  }

  /**
   * ログエントリを追加
   */
  private addLog(level: LogEntry['level'], args: unknown[]): void {
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2)
        } catch {
          return String(arg)
        }
      }
      return String(arg)
    }).join(' ')

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message
    }

    this.logs.push(entry)

    // 最大ログ数を超えたら古いログを削除
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // localStorageに定期保存（100ログごと）
    if (this.logs.length % 100 === 0) {
      this.saveLogsToStorage()
    }
  }

  /**
   * ログをlocalStorageに保存
   */
  private saveLogsToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.logs))
    } catch (e) {
      this.originalWarn.call(console, '[Logger] Failed to save logs to localStorage:', e)
    }
  }

  /**
   * ログをlocalStorageから読み込み
   */
  private loadLogsFromStorage(): void {
    try {
      const saved = localStorage.getItem(this.storageKey)
      if (saved) {
        this.logs = JSON.parse(saved)
      }
    } catch (e) {
      this.originalWarn.call(console, '[Logger] Failed to load logs from localStorage:', e)
    }
  }

  /**
   * すべてのログを取得
   */
  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  /**
   * ログをテキスト形式で取得
   */
  getLogsAsText(): string {
    return this.logs.map(entry =>
      `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`
    ).join('\n')
  }

  /**
   * ログをファイルとしてダウンロード
   */
  downloadLogs(): void {
    this.saveLogsToStorage() // 念のため保存

    const text = this.getLogsAsText()
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = 'game.log' // シンプルなファイル名に固定
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    this.originalLog.call(console, '[Logger] Logs downloaded as game.log')
  }

  /**
   * 自動ログ保存を開始（定期的にダウンロード）
   */
  startAutoSave(intervalMinutes = 5): void {
    setInterval(() => {
      this.downloadLogs()
      this.originalLog.call(console, '[Logger] Auto-saved logs')
    }, intervalMinutes * 60 * 1000)
  }

  /**
   * ログをクリア
   */
  clearLogs(): void {
    this.logs = []
    localStorage.removeItem(this.storageKey)
    this.originalLog.call(console, '[Logger] Logs cleared')
  }

  /**
   * 最新のログを取得（デバッグ用）
   */
  getRecentLogs(count = 50): LogEntry[] {
    return this.logs.slice(-count)
  }
}

// シングルトンインスタンス
export const logger = new ConsoleLogger()
