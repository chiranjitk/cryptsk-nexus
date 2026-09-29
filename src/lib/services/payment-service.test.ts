import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────
// vi.mock factories are hoisted — use vi.hoisted to avoid TDZ errors
const { integrationConfigFindFirst, integrationConfigFindUnique } = vi.hoisted(() => {
  const integrationConfigFindFirst = vi.fn()
  const integrationConfigFindUnique = vi.fn()
  return { integrationConfigFindFirst, integrationConfigFindUnique }
})

vi.mock('@/lib/db', () => ({
  db: {
    integrationConfig: {
      findFirst: integrationConfigFindFirst,
      findUnique: integrationConfigFindUnique,
    },
  },
}))

// Must import AFTER mocks are set up
import {
  createPaymentOrder,
  verifyPayment,
  testPaymentConnection,
} from './payment-service'

// ─── Helpers ──────────────────────────────────────────────────────
const mockGateway = {
  id: 'gw-1',
  provider: 'razorpay',
  apiKey: 'rzp_test_abc123',
  apiSecret: 'rzp_secret_xyz789',
  merchantId: 'merchant-001',
  environment: 'test' as const,
  enabled: true,
}

function setupRazorpayGateway(gateway = mockGateway) {
  integrationConfigFindFirst.mockResolvedValue(gateway)
}

function setupStripeGateway() {
  integrationConfigFindFirst.mockResolvedValue({
    ...mockGateway,
    provider: 'stripe',
    apiSecret: 'sk_test_stripe123',
  })
}

// ─── Tests ────────────────────────────────────────────────────────
describe('payment-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ──── createPaymentOrder ────────────────────────────────────────
  describe('createPaymentOrder', () => {
    describe('when no gateway configured', () => {
      it('should return error when no gateway is configured', async () => {
        integrationConfigFindFirst.mockResolvedValue(null)
        const result = await createPaymentOrder({
          amount: 500,
          receipt: 'rcpt-1',
        })

        expect(result.success).toBe(false)
        expect(result.provider).toBe('none')
        expect(result.error).toContain('No payment gateway configured')
      })

      it('should not call fetch when no gateway is configured', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch')
        integrationConfigFindFirst.mockResolvedValue(null)
        await createPaymentOrder({ amount: 500, receipt: 'rcpt-1' })

        expect(fetchSpy).not.toHaveBeenCalled()
        fetchSpy.mockRestore()
      })
    })

    describe('with Razorpay gateway', () => {
      beforeEach(() => {
        setupRazorpayGateway()
      })

      it('should create a Razorpay order successfully', async () => {
        const mockResponse = {
          ok: true,
          json: async () => ({
            id: 'order_rzp_123',
            amount: 50000,
            currency: 'INR',
          }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        const result = await createPaymentOrder({
          amount: 500,
          currency: 'INR',
          receipt: 'rcpt-1',
        })

        expect(result.success).toBe(true)
        expect(result.orderId).toBe('order_rzp_123')
        expect(result.amount).toBe(50000)
        expect(result.currency).toBe('INR')
        expect(result.provider).toBe('razorpay')
      })

      it('should convert amount to paise (x100) for Razorpay', async () => {
        const mockResponse = {
          ok: true,
          json: async () => ({ id: 'order_1', amount: 99900, currency: 'INR' }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        await createPaymentOrder({ amount: 999, currency: 'INR', receipt: 'rcpt-x' })

        const fetchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
        const body = JSON.parse(fetchCall[1].body)
        expect(body.amount).toBe(99900) // 999 * 100
      })

      it('should default currency to INR for Razorpay', async () => {
        const mockResponse = {
          ok: true,
          json: async () => ({ id: 'order_1', amount: 10000, currency: 'INR' }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        await createPaymentOrder({ amount: 100, receipt: 'rcpt-1' })

        const fetchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
        const body = JSON.parse(fetchCall[1].body)
        expect(body.currency).toBe('INR')
      })

      it('should include receipt in request body', async () => {
        const mockResponse = {
          ok: true,
          json: async () => ({ id: 'order_1', amount: 10000, currency: 'INR' }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        await createPaymentOrder({ amount: 100, receipt: 'rcpt-invoice-42' })

        const fetchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
        const body = JSON.parse(fetchCall[1].body)
        expect(body.receipt).toBe('rcpt-invoice-42')
      })

      it('should include subscriber notes when provided', async () => {
        const mockResponse = {
          ok: true,
          json: async () => ({ id: 'order_1', amount: 10000, currency: 'INR' }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        await createPaymentOrder({
          amount: 100,
          receipt: 'rcpt-1',
          subscriberId: 'sub-42',
          subscriberName: 'John Doe',
          invoiceId: 'inv-99',
        })

        const fetchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
        const body = JSON.parse(fetchCall[1].body)
        expect(body.notes.subscriber_id).toBe('sub-42')
        expect(body.notes.subscriber_name).toBe('John Doe')
        expect(body.notes.subscriber_id).toBe('sub-42')
        expect(body.notes.receipt).toBe('rcpt-1')
      })

      it('should handle Razorpay API error response', async () => {
        const mockResponse = {
          ok: false,
          status: 400,
          json: async () => ({
            error: { description: 'Amount must be at least minimum currency unit' },
          }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        const result = await createPaymentOrder({ amount: 0, receipt: 'rcpt-0' })

        expect(result.success).toBe(false)
        expect(result.provider).toBe('razorpay')
        expect(result.error).toContain('Amount must be at least minimum currency unit')
      })

      it('should handle Razorpay network error', async () => {
        vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network timeout'))

        const result = await createPaymentOrder({ amount: 500, receipt: 'rcpt-1' })

        expect(result.success).toBe(false)
        expect(result.provider).toBe('razorpay')
        expect(result.error).toBe('Network timeout')
      })

      it('should use Basic auth header with base64 encoded api_key:api_secret', async () => {
        const mockResponse = {
          ok: true,
          json: async () => ({ id: 'order_1', amount: 10000, currency: 'INR' }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        await createPaymentOrder({ amount: 100, receipt: 'rcpt-1' })

        const fetchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
        const authHeader = fetchCall[1].headers['Authorization']
        expect(authHeader).toMatch(/^Basic /)
        const encoded = authHeader.replace('Basic ', '')
        const decoded = Buffer.from(encoded, 'base64').toString()
        expect(decoded).toBe('rzp_test_abc123:rzp_secret_xyz789')
      })

      it('should POST to Razorpay /v1/orders endpoint', async () => {
        const mockResponse = {
          ok: true,
          json: async () => ({ id: 'order_1', amount: 10000, currency: 'INR' }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        await createPaymentOrder({ amount: 100, receipt: 'rcpt-1' })

        const fetchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(fetchCall[0]).toContain('api.razorpay.com/v1/orders')
        expect(fetchCall[1].method).toBe('POST')
      })
    })

    describe('with Stripe gateway', () => {
      beforeEach(() => {
        setupStripeGateway()
      })

      it('should create a Stripe payment intent successfully', async () => {
        const mockResponse = {
          ok: true,
          json: async () => ({
            id: 'pi_stripe_123',
            amount: 10000,
            currency: 'usd',
          }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        const result = await createPaymentOrder({
          amount: 100,
          currency: 'USD',
          receipt: 'rcpt-1',
        })

        expect(result.success).toBe(true)
        expect(result.orderId).toBe('pi_stripe_123')
        expect(result.provider).toBe('stripe')
      })

      it('should default currency to usd for Stripe', async () => {
        const mockResponse = {
          ok: true,
          json: async () => ({ id: 'pi_1', amount: 50000, currency: 'usd' }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        await createPaymentOrder({ amount: 500, receipt: 'rcpt-1' })

        const fetchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
        const body = fetchCall[1].body as string
        expect(body).toContain('currency=usd')
      })

      it('should use Bearer auth with apiSecret for Stripe', async () => {
        const mockResponse = {
          ok: true,
          json: async () => ({ id: 'pi_1', amount: 10000, currency: 'usd' }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        await createPaymentOrder({ amount: 100, receipt: 'rcpt-1' })

        const fetchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(fetchCall[1].headers['Authorization']).toBe('Bearer sk_test_stripe123')
      })

      it('should handle Stripe error response', async () => {
        const mockResponse = {
          ok: false,
          status: 402,
          json: async () => ({
            error: { message: 'Your card has insufficient funds.' },
          }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        const result = await createPaymentOrder({ amount: 10000, receipt: 'rcpt-1' })

        expect(result.success).toBe(false)
        expect(result.provider).toBe('stripe')
        expect(result.error).toContain('insufficient funds')
      })

      it('should handle Stripe network error', async () => {
        vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Connection refused'))

        const result = await createPaymentOrder({ amount: 100, receipt: 'rcpt-1' })

        expect(result.success).toBe(false)
        expect(result.provider).toBe('stripe')
        expect(result.error).toBe('Connection refused')
      })

      it('should POST to Stripe /v1/payment_intents endpoint', async () => {
        const mockResponse = {
          ok: true,
          json: async () => ({ id: 'pi_1', amount: 10000, currency: 'usd' }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        await createPaymentOrder({ amount: 100, receipt: 'rcpt-1' })

        const fetchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(fetchCall[0]).toContain('api.stripe.com/v1/payment_intents')
        expect(fetchCall[1].method).toBe('POST')
      })
    })

    describe('with unsupported provider', () => {
      it('should return error for unsupported provider', async () => {
        integrationConfigFindFirst.mockResolvedValue({
          ...mockGateway,
          provider: 'paypal',
        })

        const result = await createPaymentOrder({ amount: 100, receipt: 'rcpt-1' })

        expect(result.success).toBe(false)
        expect(result.provider).toBe('paypal')
        expect(result.error).toContain('Unsupported payment provider')
      })
    })
  })

  // ──── verifyPayment ─────────────────────────────────────────────
  describe('verifyPayment', () => {
    describe('when no gateway configured', () => {
      it('should return error when no gateway is configured', async () => {
        integrationConfigFindFirst.mockResolvedValue(null)

        const result = await verifyPayment({
          provider: 'razorpay',
          orderId: 'order_1',
          paymentId: 'pay_1',
          signature: 'sig_1',
        })

        expect(result.success).toBe(false)
        expect(result.verified).toBe(false)
        expect(result.provider).toBe('none')
        expect(result.error).toContain('No payment gateway configured')
      })
    })

    describe('Razorpay verification', () => {
      beforeEach(() => {
        setupRazorpayGateway()
      })

      it('should verify a valid Razorpay signature', async () => {
        // Create a valid HMAC-SHA256 signature for testing
        const crypto = await import('crypto')
        const expectedSig = crypto
          .createHmac('sha256', 'rzp_secret_xyz789')
          .update('order_123|pay_456')
          .digest('hex')

        const result = await verifyPayment({
          provider: 'razorpay',
          orderId: 'order_123',
          paymentId: 'pay_456',
          signature: expectedSig,
        })

        expect(result.success).toBe(true)
        expect(result.verified).toBe(true)
        expect(result.provider).toBe('razorpay')
      })

      it('should reject an invalid Razorpay signature', async () => {
        const result = await verifyPayment({
          provider: 'razorpay',
          orderId: 'order_123',
          paymentId: 'pay_456',
          signature: 'invalid_signature_hex',
        })

        expect(result.success).toBe(true)
        expect(result.verified).toBe(false)
        expect(result.provider).toBe('razorpay')
        expect(result.error).toContain('Signature mismatch')
      })

      it('should handle missing signature gracefully', async () => {
        const result = await verifyPayment({
          provider: 'razorpay',
          orderId: 'order_123',
          paymentId: 'pay_456',
          signature: '',
        })

        expect(result.success).toBe(true)
        expect(result.verified).toBe(false)
      })
    })

    describe('Stripe verification', () => {
      beforeEach(() => {
        setupStripeGateway()
      })

      it('should return verified=true for Stripe (webhook-based)', async () => {
        const result = await verifyPayment({
          provider: 'stripe',
          orderId: 'pi_123',
          paymentId: 'pm_123',
        })

        expect(result.success).toBe(true)
        expect(result.verified).toBe(true)
        expect(result.provider).toBe('stripe')
      })
    })

    describe('unsupported provider verification', () => {
      beforeEach(() => {
        setupRazorpayGateway()
      })

      it('should return error for unsupported provider', async () => {
        const result = await verifyPayment({
          provider: 'adyen',
          orderId: 'ord_1',
          paymentId: 'pay_1',
        })

        expect(result.success).toBe(false)
        expect(result.verified).toBe(false)
        expect(result.provider).toBe('adyen')
        expect(result.error).toContain('Unsupported provider')
      })
    })
  })

  // ──── testPaymentConnection ─────────────────────────────────────
  describe('testPaymentConnection', () => {
    describe('when integration not found', () => {
      it('should return error when integration does not exist', async () => {
        integrationConfigFindUnique.mockResolvedValue(null)

        const result = await testPaymentConnection('nonexistent-id')

        expect(result.success).toBe(false)
        expect(result.provider).toBe('unknown')
        expect(result.message).toBe('Integration not found')
      })
    })

    describe('Razorpay connection test', () => {
      it('should return success when Razorpay connection works', async () => {
        integrationConfigFindUnique.mockResolvedValue({
          id: 'gw-1',
          provider: 'razorpay',
          apiKey: 'rzp_test_abc123',
          apiSecret: 'rzp_secret_xyz789',
          merchantId: 'merchant-001',
          environment: 'test',
          enabled: true,
        })

        const mockResponse = {
          ok: true,
          json: async () => ({ items: [], count: 0 }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        const result = await testPaymentConnection('gw-1')

        expect(result.success).toBe(true)
        expect(result.provider).toBe('razorpay')
        expect(result.message).toContain('Connected')
        expect(result.message).toContain('Mode: test')
      })

      it('should return failure on Razorpay auth error', async () => {
        integrationConfigFindUnique.mockResolvedValue({
          id: 'gw-1',
          provider: 'razorpay',
          apiKey: 'bad_key',
          apiSecret: 'bad_secret',
          merchantId: 'merchant-001',
          environment: 'live',
          enabled: true,
        })

        const mockResponse = {
          ok: false,
          status: 401,
          json: async () => ({
            error: { description: 'Invalid API key' },
          }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        const result = await testPaymentConnection('gw-1')

        expect(result.success).toBe(false)
        expect(result.provider).toBe('razorpay')
        expect(result.message).toContain('Authentication failed')
        expect(result.message).toContain('Invalid API key')
      })

      it('should handle Razorpay network error', async () => {
        integrationConfigFindUnique.mockResolvedValue({
          id: 'gw-1',
          provider: 'razorpay',
          apiKey: 'rzp_test_abc123',
          apiSecret: 'rzp_secret_xyz789',
          merchantId: 'merchant-001',
          environment: 'test',
          enabled: true,
        })

        vi.spyOn(global, 'fetch').mockRejectedValue(new Error('DNS resolution failed'))

        const result = await testPaymentConnection('gw-1')

        expect(result.success).toBe(false)
        expect(result.provider).toBe('razorpay')
        expect(result.message).toContain('Connection failed')
        expect(result.message).toContain('DNS resolution failed')
      })

      it('should call Razorpay payments endpoint with count=1', async () => {
        integrationConfigFindUnique.mockResolvedValue({
          id: 'gw-1',
          provider: 'razorpay',
          apiKey: 'rzp_test_abc123',
          apiSecret: 'rzp_secret_xyz789',
          merchantId: 'merchant-001',
          environment: 'test',
          enabled: true,
        })

        const mockResponse = { ok: true, json: async () => ({ items: [] }) }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        await testPaymentConnection('gw-1')

        const fetchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(fetchCall[0]).toContain('api.razorpay.com/v1/payments?count=1')
        expect(fetchCall[1].method).toBe('GET')
      })
    })

    describe('Stripe connection test', () => {
      it('should return success when Stripe connection works', async () => {
        integrationConfigFindUnique.mockResolvedValue({
          id: 'gw-2',
          provider: 'stripe',
          apiKey: '',
          apiSecret: 'sk_test_stripe123',
          merchantId: '',
          environment: 'test',
          enabled: true,
        })

        const mockResponse = {
          ok: true,
          json: async () => ({
            available: [{ amount: 1250000, currency: 'usd' }],
          }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        const result = await testPaymentConnection('gw-2')

        expect(result.success).toBe(true)
        expect(result.provider).toBe('stripe')
        expect(result.message).toContain('Connected')
        expect(result.message).toContain('Mode: test')
        expect(result.message).toContain('$12500.00')
      })

      it('should format INR balance with rupee symbol', async () => {
        integrationConfigFindUnique.mockResolvedValue({
          id: 'gw-2',
          provider: 'stripe',
          apiKey: '',
          apiSecret: 'sk_test_stripe123',
          merchantId: '',
          environment: 'live',
          enabled: true,
        })

        const mockResponse = {
          ok: true,
          json: async () => ({
            available: [{ amount: 5000000, currency: 'inr' }],
          }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        const result = await testPaymentConnection('gw-2')

        expect(result.success).toBe(true)
        expect(result.message).toContain('₹50000.00')
      })

      it('should handle Stripe auth failure', async () => {
        integrationConfigFindUnique.mockResolvedValue({
          id: 'gw-2',
          provider: 'stripe',
          apiKey: '',
          apiSecret: 'sk_invalid',
          merchantId: '',
          environment: 'live',
          enabled: true,
        })

        const mockResponse = {
          ok: false,
          status: 401,
          json: async () => ({
            error: { message: 'Invalid API Key provided' },
          }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        const result = await testPaymentConnection('gw-2')

        expect(result.success).toBe(false)
        expect(result.provider).toBe('stripe')
        expect(result.message).toContain('Authentication failed')
      })

      it('should handle Stripe network error', async () => {
        integrationConfigFindUnique.mockResolvedValue({
          id: 'gw-2',
          provider: 'stripe',
          apiKey: '',
          apiSecret: 'sk_test_stripe123',
          merchantId: '',
          environment: 'test',
          enabled: true,
        })

        vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))

        const result = await testPaymentConnection('gw-2')

        expect(result.success).toBe(false)
        expect(result.provider).toBe('stripe')
        expect(result.message).toContain('Connection failed')
      })

      it('should handle zero balance gracefully', async () => {
        integrationConfigFindUnique.mockResolvedValue({
          id: 'gw-2',
          provider: 'stripe',
          apiKey: '',
          apiSecret: 'sk_test_stripe123',
          merchantId: '',
          environment: 'test',
          enabled: true,
        })

        const mockResponse = {
          ok: true,
          json: async () => ({
            available: [],
          }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        const result = await testPaymentConnection('gw-2')

        expect(result.success).toBe(true)
        expect(result.message).toContain('$0.00')
      })

      it('should call Stripe balance endpoint', async () => {
        integrationConfigFindUnique.mockResolvedValue({
          id: 'gw-2',
          provider: 'stripe',
          apiKey: '',
          apiSecret: 'sk_test_stripe123',
          merchantId: '',
          environment: 'test',
          enabled: true,
        })

        const mockResponse = {
          ok: true,
          json: async () => ({ available: [{ amount: 0, currency: 'usd' }] }),
        }
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response)

        await testPaymentConnection('gw-2')

        const fetchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(fetchCall[0]).toContain('api.stripe.com/v1/balance')
        expect(fetchCall[1].method).toBe('GET')
      })
    })

    describe('unsupported provider test', () => {
      it('should return error for unsupported provider', async () => {
        integrationConfigFindUnique.mockResolvedValue({
          id: 'gw-3',
          provider: 'square',
          apiKey: '',
          apiSecret: '',
          merchantId: '',
          environment: 'test',
          enabled: true,
        })

        const result = await testPaymentConnection('gw-3')

        expect(result.success).toBe(false)
        expect(result.provider).toBe('square')
        expect(result.message).toContain('Testing not supported')
      })
    })
  })
})
