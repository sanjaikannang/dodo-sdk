const CHECKOUT_URL = import.meta.env.VITE_CHECKOUT_URL as string
const CHECKOUT_ORIGIN = new URL(CHECKOUT_URL).origin
const PROTOCOL_VERSION = 1
const LOAD_TIMEOUT_MS = 10_000

export type CloseReason = 'dismissed' | 'completed' | 'error' | 'host'
export type ErrorCode = 'load_timeout' | 'invalid_product' | 'network' | 'unexpected'

export interface OpenOptions {
    productId: string
    onSuccess?: (e: { sessionId: string }) => void
    onClose?: (e: { reason: CloseReason }) => void
    onError?: (e: { code: ErrorCode; message: string }) => void
}

export interface CheckoutHandle {
    close: () => void
}

interface Message {
    v: number
    type: string
    payload?: Record<string, unknown>
}

const isMessage = (d: unknown): d is Message =>
    typeof d === 'object' && d !== null &&
    (d as Message).v === PROTOCOL_VERSION &&
    typeof (d as Message).type === 'string'

// A host callback that throws must never break the SDK.
function safely<T>(fn: ((e: T) => void) | undefined, arg: T) {
    try { fn?.(arg) } catch (err) { console.error('[DodoCheckout] callback threw:', err) }
}

let active: CheckoutHandle | null = null

export function open(options: OpenOptions): CheckoutHandle {
    // Double-open guard: a second call returns the existing checkout.
    if (active) return active

    if (!options || typeof options.productId !== 'string' || !options.productId.trim()) {
        throw new TypeError('DodoCheckout.open: "productId" must be a non-empty string')
    }

    const { productId, onSuccess, onClose, onError } = options
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.documentElement.style.overflow

    let finished = false
    let ready = false
    let port: MessagePort | null = null

    // --- DOM ---
    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', 'Checkout')
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0', zIndex: '2147483647',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
    })

    const iframe = document.createElement('iframe')
    iframe.src = CHECKOUT_URL
    iframe.title = 'Secure checkout'
    // allow-same-origin only preserves the checkout's OWN origin.
    // The iframe is cross-origin to the host, so the host still can't reach in.
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms')
    Object.assign(iframe.style, {
        width: '100%', maxWidth: '440px', height: 'min(720px, 100%)',
        border: '0', borderRadius: '16px', background: '#fff',
    })

    overlay.appendChild(iframe)

    // --- lifecycle ---
    function finish(reason: CloseReason) {
        if (finished) return          // onClose fires exactly once
        finished = true
        clearTimeout(timer)
        window.removeEventListener('message', onWindowMessage)
        port?.close()
        overlay.remove()
        document.documentElement.style.overflow = previousOverflow
        active = null
        previouslyFocused?.focus?.()
        safely(onClose, { reason })
    }

    function fail(code: ErrorCode, message: string) {
        if (finished) return
        safely(onError, { code, message })
        finish('error')
    }

    // --- handshake: step 1, wait for "ready" ---
    function onWindowMessage(e: MessageEvent) {
        if (e.source !== iframe.contentWindow) return   // must be OUR iframe
        if (e.origin !== CHECKOUT_ORIGIN) return        // must be the checkout's origin
        if (!isMessage(e.data) || e.data.type !== 'ready' || ready) return

        ready = true
        clearTimeout(timer)

        // --- step 2: private channel ---
        const channel = new MessageChannel()
        port = channel.port1
        port.onmessage = onPortMessage
        iframe.contentWindow!.postMessage(
            { v: PROTOCOL_VERSION, type: 'init', payload: { productId } },
            CHECKOUT_ORIGIN,        // exact origin, never "*"
            [channel.port2],
        )
    }

    function onPortMessage(e: MessageEvent) {
        if (!isMessage(e.data)) return
        const { type, payload } = e.data
        if (type === 'success' && typeof payload?.sessionId === 'string') {
            safely(onSuccess, { sessionId: payload.sessionId })
        } else if (type === 'error') {
            fail(
                (payload?.code as ErrorCode) ?? 'unexpected',
                typeof payload?.message === 'string' ? payload.message : 'Something went wrong',
            )
        } else if (type === 'close') {
            const r = payload?.reason
            finish(r === 'completed' || r === 'error' ? r : 'dismissed')
        }
        // anything else: ignored
    }

    window.addEventListener('message', onWindowMessage)   // listener BEFORE iframe loads
    const timer = setTimeout(
        () => fail('load_timeout', 'Checkout took too long to load'),
        LOAD_TIMEOUT_MS,
    )

    document.documentElement.style.overflow = 'hidden'
    document.body.appendChild(overlay)

    const handle: CheckoutHandle = { close: () => finish('host') }
    active = handle
    return handle
}