const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const {
  createSafeFetch,
  isForbiddenAddress,
  validatePublicHttpsUrl,
} = require('../src/safe-fetch.cjs');

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

function mockRequest(handler) {
  return function request(url, options, callback) {
    const request = new EventEmitter();
    request.setTimeout = () => request;
    request.destroy = (error) => error && request.emit('error', error);
    request.end = () => {
      queueMicrotask(() => {
        const result = handler(url, options);
        const response = Readable.from(result.chunks || []);
        response.statusCode = result.statusCode || 200;
        response.statusMessage = result.statusMessage || 'OK';
        response.headers = result.headers || {};
        callback(response);
      });
    };
    return request;
  };
}

test('chặn IPv4 nội bộ, loopback, link-local, metadata và dạng biểu diễn khác', () => {
  for (const address of [
    '0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1',
    '169.254.169.254', '172.16.0.1', '192.168.1.1', '224.0.0.1',
  ]) assert.equal(isForbiddenAddress(address), true, address);
  assert.equal(isForbiddenAddress('93.184.216.34'), false);
});

test('chặn IPv6 loopback, ULA, link-local, multicast và IPv4-mapped', () => {
  for (const address of ['::', '::1', 'fd00::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1']) {
    assert.equal(isForbiddenAddress(address), true, address);
  }
  assert.equal(isForbiddenAddress('2606:4700:4700::1111'), false);
});

test('chỉ cho phép HTTPS và không cho URL chứa credential', async () => {
  await assert.rejects(validatePublicHttpsUrl('http://example.com/a', publicLookup), /HTTPS/);
  await assert.rejects(validatePublicHttpsUrl('file:///etc/passwd', publicLookup), /HTTPS/);
  await assert.rejects(validatePublicHttpsUrl('https://user:pass@example.com/a', publicLookup), /đăng nhập/);
});

test('chặn hostname nếu DNS trả về một địa chỉ private hoặc kết quả trộn', async () => {
  await assert.rejects(
    validatePublicHttpsUrl('https://metadata.example/a', async () => [{ address: '169.254.169.254', family: 4 }]),
    /nội bộ/
  );
  await assert.rejects(
    validatePublicHttpsUrl('https://mixed.example/a', async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]),
    /nội bộ/
  );
});

test('chuẩn hóa và chặn IPv4 dạng số nguyên, hex và octal', async () => {
  for (const url of ['https://2130706433/', 'https://0x7f000001/', 'https://0177.0.0.1/']) {
    await assert.rejects(validatePublicHttpsUrl(url, publicLookup), /nội bộ/);
  }
});

test('ghim kết nối vào IP công khai đã kiểm tra', async () => {
  let pinned;
  const fetch = createSafeFetch({
    lookup: publicLookup,
    request: mockRequest((_url, options) => {
      options.lookup('example.com', {}, (_error, address, family) => { pinned = { address, family }; });
      return { chunks: [Buffer.from('{"ok":true}')], headers: { 'content-type': 'application/json' } };
    }),
  });
  const response = await fetch('https://example.com/context.json');
  assert.deepEqual(pinned, { address: '93.184.216.34', family: 4 });
  assert.deepEqual(await response.json(), { ok: true });
});

test('kiểm tra lại URL sau redirect và chặn redirect vào localhost', async () => {
  let requests = 0;
  const fetch = createSafeFetch({
    lookup: publicLookup,
    request: mockRequest(() => {
      requests += 1;
      return { statusCode: 302, headers: { location: 'https://127.0.0.1/private' } };
    }),
  });
  await assert.rejects(fetch('https://example.com/start'), /nội bộ/);
  assert.equal(requests, 1);
});

test('giới hạn số redirect', async () => {
  const fetch = createSafeFetch({
    lookup: publicLookup,
    maxRedirects: 1,
    request: mockRequest((url) => ({ statusCode: 302, headers: { location: `${url.origin}/next` } })),
  });
  await assert.rejects(fetch('https://example.com/start'), /quá số lần/);
});

test('từ chối phản hồi vượt giới hạn kích thước', async () => {
  const fetch = createSafeFetch({
    lookup: publicLookup,
    maxBytes: 8,
    request: mockRequest(() => ({ chunks: [Buffer.from('123456789')] })),
  });
  await assert.rejects(fetch('https://example.com/large'), /kích thước/);
});


test('từ chối redirect và trạng thái HTTP không hợp lệ mà không treo tiến trình', async () => {
  const malformedRedirect = createSafeFetch({
    lookup: publicLookup,
    request: mockRequest(() => ({ statusCode: 302, headers: { location: 'https://[' } })),
  });
  await assert.rejects(malformedRedirect('https://example.com/start'), /chuyển hướng không hợp lệ/);

  const malformedStatus = createSafeFetch({
    lookup: publicLookup,
    request: mockRequest(() => ({ statusCode: 101, statusMessage: 'Switching Protocols' })),
  });
  await assert.rejects(malformedStatus('https://example.com/start'), /trạng thái HTTP không hợp lệ/);
});
