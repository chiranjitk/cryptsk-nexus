/**
 * StaySuite Circuit Breaker for RADIUS
 *
 * Prevents cascade failures when FreeRADIUS is down:
 *   - CLOSED  → normal operation, all requests pass through
 *   - OPEN    → RADIUS down detected, all requests fast-fail (0ms)
 *   - HALF_OPEN → cooldown passed, one test request allowed
 *
 * Failure tracking:
 *   - Consecutive failures increment a counter
 *   - Any success resets the counter
 *   - When counter reaches `failureThreshold`, circuit opens
 *   - After `resetTimeoutMs`, circuit enters half-open
 *   - In half-open, one request goes through; success → closed, fail → open
 *
 * Metrics exposed for monitoring/health checks.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit (default: 5) */
  failureThreshold: number;
  /** How long to stay OPEN before trying HALF_OPEN (default: 30000ms = 30s) */
  resetTimeoutMs: number;
  /** How many successes in HALF_OPEN before fully closing (default: 1) */
  halfOpenSuccessThreshold: number;
  /** Optional name for logging (default: 'CircuitBreaker') */
  name: string;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  consecutiveFailures: number;
  totalFailures: number;
  totalSuccesses: number;
  totalShortCircuits: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  lastStateChangeTime: number | null;
  openedCount: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenSuccessThreshold: 1,
  name: 'CircuitBreaker',
};

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private halfOpenSuccesses = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private totalShortCircuits = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private lastStateChangeTime: number | null = null;
  private openedCount = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly log: (msg: string) => void;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.log = (msg: string) => {
      const tag = `[${this.config.name}]`;
      console.log(tag, msg);
    };
  }

  /**
   * Execute a function through the circuit breaker.
   *
   * Returns the result of `fn()` if the circuit allows it.
   * Throws CircuitOpenError if the circuit is OPEN (fast-fail).
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from OPEN → HALF_OPEN
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - (this.lastFailureTime || 0);
      if (elapsed >= this.config.resetTimeoutMs) {
        this.transitionTo('HALF_OPEN');
      }
    }

    // Fast-fail if OPEN
    if (this.state === 'OPEN') {
      this.totalShortCircuits++;
      throw new CircuitOpenError(this.config.name);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();
    this.consecutiveFailures = 0;

    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.config.halfOpenSuccessThreshold) {
        this.transitionTo('CLOSED');
        this.halfOpenSuccesses = 0;
      }
    }
  }

  private onFailure(): void {
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.consecutiveFailures++;

    if (this.state === 'HALF_OPEN') {
      // Test request failed — go back to OPEN
      this.halfOpenSuccesses = 0;
      this.transitionTo('OPEN');
    } else if (this.state === 'CLOSED') {
      if (this.consecutiveFailures >= this.config.failureThreshold) {
        this.transitionTo('OPEN');
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    this.lastStateChangeTime = Date.now();

    if (newState === 'OPEN') {
      this.openedCount++;
    }
    if (newState === 'CLOSED') {
      this.consecutiveFailures = 0;
    }
    if (newState === 'HALF_OPEN') {
      this.halfOpenSuccesses = 0;
    }

    this.log(
      `State: ${oldState} → ${newState} ` +
      `(failures=${this.consecutiveFailures}, openedCount=${this.openedCount}, ` +
      `totalFailures=${this.totalFailures}, shortCircuits=${this.totalShortCircuits})`
    );
  }

  /** Get current circuit breaker state and metrics. */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      totalShortCircuits: this.totalShortCircuits,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      lastStateChangeTime: this.lastStateChangeTime,
      openedCount: this.openedCount,
    };
  }

  /** Check if circuit is currently allowing requests through. */
  isAvailable(): boolean {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'HALF_OPEN') return true;
    // OPEN — check if cooldown has elapsed
    if (this.lastFailureTime && Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
      return true; // Will transition to HALF_OPEN on next execute()
    }
    return false;
  }

  /**
   * Manually reset the circuit breaker to CLOSED state.
   * Useful for admin intervention or after confirming RADIUS is back up.
   */
  reset(): void {
    this.consecutiveFailures = 0;
    this.halfOpenSuccesses = 0;
    if (this.state !== 'CLOSED') {
      this.transitionTo('CLOSED');
    }
  }

  /**
   * Manually trip the circuit breaker to OPEN state.
   * Useful for admin intervention or maintenance mode.
   */
  trip(): void {
    this.consecutiveFailures = this.config.failureThreshold;
    this.lastFailureTime = Date.now();
    if (this.state !== 'OPEN') {
      this.transitionTo('OPEN');
    }
  }
}

/**
 * Error thrown when the circuit breaker is OPEN and requests are fast-failed.
 */
export class CircuitOpenError extends Error {
  public readonly circuitName: string;
  constructor(name: string) {
    super(`Circuit breaker [${name}] is OPEN — requests are being fast-rejected`);
    this.name = 'CircuitOpenError';
    this.circuitName = name;
  }
}

// ─── Singleton for RADIUS ──────────────────────────────────────

const RADIUS_CB_GLOBAL_KEY = '__radiusCircuitBreaker';

function getRadiusCircuitBreaker(): CircuitBreaker {
  const g = globalThis as any;
  if (!g[RADIUS_CB_GLOBAL_KEY]) {
    g[RADIUS_CB_GLOBAL_KEY] = new CircuitBreaker({
      name: 'RADIUS',
      failureThreshold: 5,      // 5 consecutive failures → OPEN
      resetTimeoutMs: 30_000,   // 30s cooldown before HALF_OPEN
      halfOpenSuccessThreshold: 1, // 1 success in HALF_OPEN → CLOSED
    });
    console.log('[RADIUS-CB] Circuit breaker initialized (threshold=5, cooldown=30s)');
  }
  return g[RADIUS_CB_GLOBAL_KEY] as CircuitBreaker;
}

/**
 * Get the RADIUS circuit breaker instance.
 * Used by health check endpoints and admin APIs.
 */
export function getRadiusCircuitBreakerMetrics(): CircuitBreakerMetrics {
  return getRadiusCircuitBreaker().getMetrics();
}

/**
 * Reset the RADIUS circuit breaker (admin use).
 */
export function resetRadiusCircuitBreaker(): void {
  getRadiusCircuitBreaker().reset();
}

/**
 * Trip the RADIUS circuit breaker (admin use / maintenance).
 */
export function tripRadiusCircuitBreaker(): void {
  getRadiusCircuitBreaker().trip();
}

/**
 * Execute a RADIUS call through the circuit breaker.
 * Wraps the actual RADIUS communication — if circuit is OPEN, fast-fails.
 */
export async function radiusThroughCircuit<T>(fn: () => Promise<T>): Promise<T> {
  return getRadiusCircuitBreaker().execute(fn);
}