// src/utils/logger.ts

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'; 

class DhubAuthLogger {
  private prefix = '[DHUB_AUTH]';

  private getTimestamp() {
    return new Date().toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' }) + '.' + new Date().getMilliseconds().toString().padStart(3, '0');
  }

  log(step: string, message: string, data?: any) {
    console.log(`${this.prefix} [${this.getTimestamp()}] [${step}] 🔵 ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  success(step: string, message: string, data?: any) {
    console.log(`${this.prefix} [${this.getTimestamp()}] [${step}] ✅ ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  warn(step: string, message: string, data?: any) {
    console.warn(`${this.prefix} [${this.getTimestamp()}] [${step}] ⚠️ ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  error(step: string, message: string, error?: any) {
    console.error(`${this.prefix} [${this.getTimestamp()}] [${step}] ❌ ${message}`, error?.message || error || '');
  }
}

export const authLogger = new DhubAuthLogger();
