// Test-only Neon transport bridge. Never imported by application code.
// Only the deliberately invalid fixture hostname is intercepted. Queries go
// to disposable local PostgreSQL; ordinary fetch behavior remains unchanged.
const endpoint = new URL(process.env.DEMO_TEST_SQL_URL || 'http://127.0.0.1:1');
if (endpoint.hostname !== '127.0.0.1' || endpoint.protocol !== 'http:') throw Error('Test SQL endpoint must be loopback HTTP.');
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
 const url = new URL(typeof input === 'string' ? input : input.url || String(input));
 return nativeFetch(['demo-test.invalid', 'api.invalid'].includes(url.hostname) ? endpoint : input, options);
};
