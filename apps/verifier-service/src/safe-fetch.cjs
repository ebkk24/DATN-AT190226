const dns = require('node:dns').promises;
const https = require('node:https');
const net = require('node:net');

const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_REDIRECTS = 3;

function ipv4Number(address) {
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  if (octets.some((value) => value < 0 || value > 255)) return null;
  return octets.reduce((value, octet) => (value << 8n) | BigInt(octet), 0n);
}

function inIpv4Cidr(value, base, bits) {
  const shift = BigInt(32 - bits);
  return value >> shift === ipv4Number(base) >> shift;
}

function isForbiddenIpv4(address) {
  const value = ipv4Number(address);
  if (value === null) return true;
  return [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ].some(([base, bits]) => inIpv4Cidr(value, base, bits));
}

function ipv6Number(input) {
  let address = input.toLowerCase().replace(/^\[|\]$/g, '');
  if (address.includes('%')) return null;
  if (address.includes('.')) {
    const lastColon = address.lastIndexOf(':');
    const ipv4 = ipv4Number(address.slice(lastColon + 1));
    if (lastColon < 0 || ipv4 === null) return null;
    address = `${address.slice(0, lastColon)}:${Number(ipv4 >> 16n).toString(16)}:${Number(ipv4 & 0xffffn).toString(16)}`;
  }
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
}

function isForbiddenIpv6(address) {
  const value = ipv6Number(address);
  if (value === null) return true;
  if (value === 0n || value === 1n) return true;
  if (value >> 120n === 0xffn) return true; // multicast
  if (value >> 121n === 0x7en) return true; // fc00::/7
  if (value >> 118n === 0x3fan) return true; // fe80::/10
  if (value >> 96n === 0x20010db8n) return true; // documentation
  if (value >> 32n === 0xffffn) return isForbiddenIpv4([
    Number((value >> 24n) & 255n),
    Number((value >> 16n) & 255n),
    Number((value >> 8n) & 255n),
    Number(value & 255n),
  ].join('.'));
  if (value >> 32n === 0n) return true; // IPv4-compatible/địa chỉ đặc biệt
  if (value >> 32n === 0x64ff9bn) return true; // NAT64 well-known prefix
  if (value >> 80n === 0x64ff9b0001n) return true; // NAT64 local-use prefix
  return false;
}

function isForbiddenAddress(address) {
  const normalized = address.replace(/^\[|\]$/g, '');
  const family = net.isIP(normalized);
  if (family === 4) return isForbiddenIpv4(normalized);
  if (family === 6) return isForbiddenIpv6(normalized);
  return true;
}

async function validatePublicHttpsUrl(value, lookup = dns.lookup) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('URL từ xa không hợp lệ.');
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Chỉ cho phép tải tài nguyên từ xa qua HTTPS.');
  if (url.username || url.password) throw new Error('URL từ xa không được chứa thông tin đăng nhập.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname) throw new Error('URL từ xa không có hostname.');
  let addresses;
  if (net.isIP(hostname)) {
    addresses = [{ address: hostname, family: net.isIP(hostname) }];
  } else {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  }
  if (!Array.isArray(addresses) || addresses.length === 0) throw new Error('Hostname không phân giải được địa chỉ IP.');
  if (addresses.some(({ address }) => isForbiddenAddress(address))) {
    throw new Error('Từ chối truy cập địa chỉ nội bộ, dành riêng hoặc metadata.');
  }
  return { url, addresses };
}

function responseHeaders(headers) {
  const output = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => output.append(name, item));
    else output.set(name, String(value));
  }
  return output;
}

function sanitizedHeaders(input) {
  const headers = new Headers(input || {});
  for (const name of ['authorization', 'cookie', 'host', 'proxy-authorization']) headers.delete(name);
  headers.set('accept', headers.get('accept') || 'application/json, application/ld+json');
  headers.set('user-agent', 'datn-blockcerts-verifier/0.1');
  return Object.fromEntries(headers.entries());
}

function requestOnce(url, address, family, options, requestImpl = https.request) {
  const method = String(options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) throw new Error('Chỉ cho phép GET hoặc HEAD khi tải tài nguyên xác minh.');
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = requestImpl(url, {
      method,
      headers: sanitizedHeaders(options.headers),
      lookup(_hostname, lookupOptions, callback) {
        if (lookupOptions && lookupOptions.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      },
      servername: url.hostname,
    }, (response) => {
      const status = Number(response.statusCode || 0);
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && location) {
        response.resume();
        try {
          const redirect = new URL(location, url).href;
          settled = true;
          resolve({ redirect });
        } catch {
          fail(new Error('URL chuyển hướng không hợp lệ.'));
        }
        return;
      }
      const declaredLength = Number(response.headers['content-length'] || 0);
      if (declaredLength > options.maxBytes) {
        response.destroy();
        fail(new Error('Phản hồi từ xa vượt quá giới hạn kích thước.'));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > options.maxBytes) {
          response.destroy();
          fail(new Error('Phản hồi từ xa vượt quá giới hạn kích thước.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (settled) return;
        const noBody = method === 'HEAD' || [204, 205, 304].includes(status);
        try {
          const result = new Response(noBody ? null : Buffer.concat(chunks), {
            status,
            statusText: response.statusMessage,
            headers: responseHeaders(response.headers),
          });
          settled = true;
          resolve({ response: result });
        } catch {
          fail(new Error('Phản hồi từ xa có trạng thái HTTP không hợp lệ.'));
        }
      });
      response.on('error', fail);
    });
    request.setTimeout(options.timeoutMs, () => request.destroy(new Error('Hết thời gian tải tài nguyên từ xa.')));
    request.on('error', fail);
    request.end();
  });
}

function createSafeFetch(configuration = {}) {
  const lookup = configuration.lookup || dns.lookup;
  const requestImpl = configuration.request || https.request;
  const maxBytes = configuration.maxBytes || DEFAULT_MAX_BYTES;
  const timeoutMs = configuration.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxRedirects = configuration.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  return async function safeFetch(input, init = {}) {
    let current = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const requestOptions = { ...init, method: init.method || input.method || 'GET', headers: init.headers || input.headers, maxBytes, timeoutMs };
    for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
      const validated = await validatePublicHttpsUrl(current, lookup);
      const selected = validated.addresses[0];
      const result = await requestOnce(validated.url, selected.address, selected.family, requestOptions, requestImpl);
      if (!result.redirect) return result.response;
      if (redirects === maxRedirects) throw new Error('Tài nguyên từ xa chuyển hướng quá số lần cho phép.');
      current = result.redirect;
    }
    throw new Error('Không thể tải tài nguyên từ xa.');
  };
}

module.exports = {
  DEFAULT_MAX_BYTES,
  createSafeFetch,
  isForbiddenAddress,
  validatePublicHttpsUrl,
};
