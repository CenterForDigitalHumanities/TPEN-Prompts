/**
 * @file Environment configuration. Matches the pattern used by TPEN-interfaces
 * (tpen3-interfaces/api/config.js) so the idToken flow and services URLs line
 * up with every other TPEN surface.
 *
 * ACTIVE_ENV resolution order:
 *   1. `globalThis.TPEN_ENV`
 *   2. `<meta name="tpen-env" content="local|dev|prod">`
 *   3. fallback `'prod'`
 *
 * @author thehabes
 */

const META_ENV = typeof document !== 'undefined'
    ? document.querySelector('meta[name="tpen-env"]')?.content
    : undefined

/** @type {'local'|'dev'|'prod'} */
const ACTIVE_ENV = (
    (typeof globalThis !== 'undefined' ? globalThis.TPEN_ENV : undefined)
    ?? META_ENV
    ?? 'prod'
)

/** @type {Record<string, { servicesURL: string, interfacesURL: string }>} */
const ENVIRONMENTS = {
    local: {
        servicesURL: 'http://localhost:3012',
        interfacesURL: 'http://localhost:4000'
    },
    dev: {
        servicesURL: 'https://dev.api.t-pen.org',
        interfacesURL: 'http://localhost:4000'
    },
    prod: {
        servicesURL: 'https://api.t-pen.org',
        interfacesURL: 'https://app.t-pen.org'
    }
}

/**
 * Active config for this page load, flattened for convenient destructuring.
 * @type {{ env: string, servicesURL: string, interfacesURL: string }}
 */
export const CONFIG = {
    env: ACTIVE_ENV,
    ...ENVIRONMENTS[ACTIVE_ENV]
}
