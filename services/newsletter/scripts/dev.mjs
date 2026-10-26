import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { GET } from '../api/index.mjs';
const port = Number(process.env.PORT || 4335);
createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(`http://127.0.0.1:${port}${incoming.url}`, { method: incoming.method, headers: incoming.headers, ...(['GET','HEAD'].includes(incoming.method) ? {} : { body: Readable.toWeb(incoming), duplex: 'half' }) });
    const response = await GET(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end('Service unavailable'); }
}).listen(port, '127.0.0.1', () => console.log(`Newsletter service: http://127.0.0.1:${port}. Sending follows private environment gates.`));
