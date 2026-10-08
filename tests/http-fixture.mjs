import { Readable } from 'node:stream';

// Real Node request streams and standard Response objects, without binding a
// listening socket. Handler behavior is identical in restricted environments.
export function invokeHandler(handler, { path, body, method = 'POST', headers = {}, ip = '127.0.0.1' }) {
  return new Promise(resolve => {
    const request = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
    request.url = path; request.method = method;
    request.headers = Object.fromEntries(Object.entries({ host: 'localhost', 'Content-Type': 'application/json', ...headers })
      .map(([key, value]) => [key.toLowerCase(), value]));
    request.socket = { remoteAddress: ip };
    const responseHeaders = new Headers();
    let status = 200;
    const response = {
      headersSent: false,
      setHeader(key, value) { responseHeaders.set(key, value); },
      writeHead(code, values = {}) {
        status = code; this.headersSent = true;
        for (const [key, value] of Object.entries(values)) responseHeaders.set(key, value);
      },
      end(value) { resolve(new Response(value, { status, headers: responseHeaders })); },
    };
    handler(request, response);
  });
}
