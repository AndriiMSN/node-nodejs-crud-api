import cluster, { Worker } from 'node:cluster';
import { availableParallelism } from 'node:os';
import { createServer, request as httpRequest, IncomingMessage, ServerResponse } from 'node:http';
import 'dotenv/config';
import { buildApp } from './app.js';

const PORT = parseInt(process.env.PORT || '4000', 10);
const WORKERS_COUNT = availableParallelism() - 1;

if (cluster.isPrimary) {
  console.log(`Primary process ${process.pid} is running`);
  console.log(`Starting ${WORKERS_COUNT} workers...`);

  const workers: Worker[] = [];
  let currentWorkerIndex = 0;

  for (let i = 0; i < WORKERS_COUNT; i++) {
    const worker = cluster.fork({
      WORKER_PORT: (PORT + i + 1).toString(),
    });
    workers.push(worker);

    worker.on('message', (msg: any) => {
      if (msg.type === 'sync') {
        workers.forEach((w) => {
          if (w !== worker && w.process.pid) {
            w.send(msg);
          }
        });
      }
    });
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
    const index = workers.indexOf(worker);
    const newWorker = cluster.fork({
      WORKER_PORT: (PORT + index + 1).toString(),
    });

    newWorker.on('message', (msg: any) => {
      if (msg.type === 'sync') {
        workers.forEach((w) => {
          if (w !== newWorker && w.process.pid) {
            w.send(msg);
          }
        });
      }
    });

    workers[index] = newWorker;
  });

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const targetPort = PORT + currentWorkerIndex + 1;
    currentWorkerIndex = (currentWorkerIndex + 1) % WORKERS_COUNT;

    const proxy = httpRequest(
      {
        hostname: 'localhost',
        port: targetPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (proxyRes: IncomingMessage) => {
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );

    proxy.on('error', (err: Error) => {
      console.error(`Proxy error for worker on port ${targetPort}:`, err.message);
      res.writeHead(502);
      res.end('Bad Gateway');
    });

    req.pipe(proxy);
  });

  server.listen(PORT, () => {
    console.log(`Load balancer listening on http://localhost:${PORT}`);
    workers.forEach((_, i) => {
      console.log(`  → Worker ${i + 1} on port ${PORT + i + 1}`);
    });
  });
} else {
  const WORKER_PORT = parseInt(process.env.WORKER_PORT || (PORT + 1).toString(), 10);

  const app = buildApp();

  app.listen({ port: WORKER_PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Worker ${process.pid} listening on ${address}`);
  });

  process.on('message', async (msg: any) => {
    if (msg.type === 'sync') {
      const { db } = await import('./db/database.js');
      db.applySync(msg.action, msg.data);
    }
  });
}
