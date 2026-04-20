/**
 * @file Auth resolution for TPEN-Prompts.
 *
 * This tool never initiates login. A token is supplied externally — either via
 * the parent transcription interface's `AUTH_TOKEN` postMessage (when embedded
 * as a splitscreen tool) or via `?idToken=` on the URL (when opened standalone
 * from TPEN3 with a returnTo). Same localStorage key (`userToken`) and URL-param
 * name (`idToken`) as tpen3-interfaces, so stored sessions are interchangeable.
 *
 * @author thehabes
 */

const TOKEN_KEY = 'userToken'

/**
 * Restore `=` padding on a base64url string and swap URL-safe chars back to
 * standard base64 so `atob` can decode it.
 * @param {string} s
 * @returns {string}
 */
function restorePadding(s) {
    const pad = s.length % 4
    if (pad) {
        if (pad === 1) throw new Error('Invalid base64url length')
        s += '===='.slice(0, 4 - pad)
    }
    return s.replace(/-/g, '+').replace(/_/g, '/')
}

/**
 * Decode a JWT's payload segment. Does not verify the signature.
 * @param {string} token
 * @returns {Record<string, unknown>}
 */
function decodeJwt(token) {
    return token ? JSON.parse(atob(restorePadding(token.split('.')[1]))) : {}
}

/**
 * True if the token's `exp` claim is missing, non-numeric, or in the past.
 * Any decode error is treated as expired.
 * @param {string} token
 * @returns {boolean}
 */
function isExpired(token) {
    try {
        const { exp } = decodeJwt(token)
        if (typeof exp !== 'number' || !Number.isFinite(exp)) return true
        return Date.now() >= exp * 1000
    } catch {
        return true
    }
}

/** Remove `idToken` from the current URL without a navigation. */
function stripAuthParamsFromUrl() {
    const url = new URL(location.href)
    url.searchParams.delete('idToken')
    history.replaceState(null, '', url.pathname + url.search + url.hash)
}

/**
 * Return a valid token from the URL or localStorage, or null. Never redirects.
 * When a URL token is present it's persisted and the URL is scrubbed.
 * @returns {string|null}
 */
export function resolveToken() {
    const urlToken = new URLSearchParams(location.search).get('idToken')
    const stored = localStorage.getItem(TOKEN_KEY)
    const candidate = urlToken ?? stored

    if (urlToken) stripAuthParamsFromUrl()

    if (!candidate || isExpired(candidate)) {
        localStorage.removeItem(TOKEN_KEY)
        return null
    }

    localStorage.setItem(TOKEN_KEY, candidate)
    return candidate
}

/** Remove any stored token from `localStorage`. */
export function clearStoredToken() {
    localStorage.removeItem(TOKEN_KEY)
}

/**
 * Persist a token if it's present and unexpired. Clears storage otherwise.
 * @param {string|null|undefined} token
 * @returns {string|null} the stored token, or null when rejected.
 */
export function persistToken(token) {
    if (!token || isExpired(token)) {
        localStorage.removeItem(TOKEN_KEY)
        return null
    }
    localStorage.setItem(TOKEN_KEY, token)
    return token
}

/**
 * Extract the agent IRI from a TPEN JWT.
 *
 * Mirrors tpen3-interfaces/components/iiif-tools/index.js:getAgentIRIFromToken.
 * The agent IRI lives in a custom claim whose key ends with `/agent`
 * (typically `http://store.rerum.io/agent`).
 * @param {string} token
 * @returns {string|null}
 */
export function getAgentIRIFromToken(token) {
    try {
        const decoded = decodeJwt(token)
        if (!decoded || typeof decoded !== 'object') return null
        const key = Object.keys(decoded).find(k => k.endsWith('/agent')) || 'http://store.rerum.io/agent'
        return decoded[key] ?? null
    } catch {
        return null
    }
}
