# Часть 4: Горизонтальное масштабирование

## Цель

Реализовать горизонтальное масштабирование с помощью Node.js Cluster API и load balancer. Это даёт **+50 баллов** — самый большой бонус в задании.

---

## Ключевые концепции

### Что такое горизонтальное масштабирование?

**Вертикальное масштабирование (scaling up):**
- Увеличение мощности одного сервера (больше CPU, RAM)
- Ограничено физическими возможностями железа
- Дороже по мере роста

**Горизонтальное масштабирование (scaling out):**
- Добавление большего количества серверов
- Почти неограниченный рост
- Дешевле на больших объёмах

В нашем случае "серверы" — это **worker процессы** на одной машине, но принцип тот же.

---

### Node.js Cluster API

Node.js однопоточный по умолчанию — один процесс использует одно ядро CPU. На 8-ядерном процессоре остальные 7 ядер простаивают.

**Cluster API** позволяет:
- Создавать несколько процессов (workers) из одного кода
- Каждый worker работает на своём ядре CPU
- Primary процесс управляет workers

```ts
import cluster from 'node:cluster';

if (cluster.isPrimary) {
  // Главный процесс — создаёт workers
  cluster.fork();  // Создать worker
} else {
  // Worker процесс — запускает приложение
  app.listen(PORT);
}
```

**`availableParallelism()`** — возвращает количество логических ядер CPU:
```ts
import { availableParallelism } from 'node:os';
const cores = availableParallelism(); // 12 на типичной машине
```

По заданию: workers = `availableParallelism() - 1` (оставляем одно ядро для primary процесса).

---

### Load Balancer — распределение нагрузки

Load balancer получает запросы от клиентов и распределяет их между workers.

**Round-robin алгоритм:**
```
Request 1 → Worker 1
Request 2 → Worker 2
Request 3 → Worker 3
Request 4 → Worker 1  (начинаем сначала)
Request 5 → Worker 2
...
```

Простейший алгоритм, но эффективный для равномерного распределения.

**Альтернативы:**
- Least connections — на worker с меньшим количеством активных соединений
- Random — случайный worker
- IP hash — один клиент всегда на один worker (для сессий)

---

## Архитектура нашей реализации

```
Клиент
   ↓
Load Balancer (localhost:4000)
   ↓
Round-robin распределение
   ↓
   ├→ Worker 1 (localhost:4001)
   ├→ Worker 2 (localhost:4002)
   └→ Worker 3 (localhost:4003)
   
IPC (Inter-Process Communication)
   Worker 1 → Primary → Workers 2,3
```

**Проблема:** Каждый worker имеет свою копию `products` массива в памяти. Если worker 1 создаст продукт, worker 2 не будет об этом знать.

**Решение:** IPC — workers отправляют сообщения primary процессу, который broadcast всем остальным.

---

## Разбор кода

### 1. Primary процесс — создание workers

```ts
if (cluster.isPrimary) {
  const WORKERS_COUNT = availableParallelism() - 1;
  const workers: cluster.Worker[] = [];

  for (let i = 0; i < WORKERS_COUNT; i++) {
    const worker = cluster.fork({
      WORKER_PORT: (PORT + i + 1).toString(),  // Переменная окружения для worker
    });
    workers.push(worker);
  }
}
```

**`cluster.fork(env)`** — создаёт дочерний процесс:
- Запускает тот же файл (`cluster.ts`)
- Но `cluster.isPrimary === false` в дочернем процессе
- `env` — дополнительные переменные окружения только для этого worker

Каждый worker слушает на своём порту: PORT+1, PORT+2, PORT+3...

---

### 2. Worker процесс — запуск Fastify

```ts
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
}
```

Worker не знает о load balancer — просто запускает обычный Fastify сервер на своём порту.

**`process.pid`** — уникальный ID процесса в системе.

---

### 3. Load Balancer — HTTP proxy

```ts
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const targetPort = PORT + currentWorkerIndex + 1;
  currentWorkerIndex = (currentWorkerIndex + 1) % WORKERS_COUNT;

  const proxy = httpRequest({
    hostname: 'localhost',
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: req.headers,
  }, (proxyRes: IncomingMessage) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxy.on('error', (err: Error) => {
    res.writeHead(502);
    res.end('Bad Gateway');
  });

  req.pipe(proxy);
});

server.listen(PORT);
```

**Как это работает:**

1. `currentWorkerIndex` — счётчик от 0 до WORKERS_COUNT-1
2. `(currentWorkerIndex + 1) % WORKERS_COUNT` — циклический переход (0→1→2→0→1...)
3. `httpRequest()` — создаём HTTP запрос к worker
4. `req.pipe(proxy)` — перенаправляем тело запроса от клиента к worker
5. `proxyRes.pipe(res)` — перенаправляем ответ от worker к клиенту

**HTTP Proxy** — это прослойка между клиентом и сервером. Load balancer не парсит запрос, просто пересылает байты.

---

### 4. IPC — синхронизация состояния БД

**Проблема:**
```
POST /api/products → Worker 1 → products[0] = {id: "123", ...}
GET /api/products  → Worker 2 → products = []  ❌ пусто!
```

**Решение — IPC (Inter-Process Communication):**

#### В `database.ts`:

```ts
function broadcastToWorkers(action: string, data: any) {
  if (process.send) {  // Метод доступен только в worker процессах
    process.send({ type: 'sync', action, data });
  }
}

export const db = {
  create(product: Product): Product {
    products.push(product);
    broadcastToWorkers('create', product);  // Отправляем сообщение primary
    return product;
  },
  
  applySync(action: string, data: any) {
    switch (action) {
      case 'create':
        if (!products.find((p) => p.id === data.id)) {
          products.push(data);  // Применяем изменение от другого worker
        }
        break;
      // ...
    }
  }
}
```

**`process.send(message)`** — отправка сообщения родительскому процессу.

#### В `cluster.ts` (primary):

```ts
worker.on('message', (msg: any) => {
  if (msg.type === 'sync') {
    workers.forEach((w) => {
      if (w !== worker && w.process.pid) {
        w.send(msg);  // Broadcast всем остальным workers
      }
    });
  }
});
```

**Primary процесс как посредник:**
1. Worker 1 создаёт продукт → отправляет `{type: 'sync', action: 'create', data: {...}}`
2. Primary получает сообщение → broadcast Workers 2,3
3. Workers 2,3 получают сообщение → вызывают `db.applySync()`

#### В `cluster.ts` (worker):

```ts
process.on('message', async (msg: any) => {
  if (msg.type === 'sync') {
    const { db } = await import('./db/database.js');
    db.applySync(msg.action, msg.data);
  }
});
```

Worker применяет изменения от других workers.

---

### 5. Restart при падении worker

```ts
cluster.on('exit', (worker, code, signal) => {
  console.log(`Worker ${worker.process.pid} died. Restarting...`);
  const index = workers.indexOf(worker);
  const newWorker = cluster.fork({
    WORKER_PORT: (PORT + index + 1).toString(),
  });
  workers[index] = newWorker;
});
```

Если worker упал (uncaught exception, kill signal) — primary автоматически создаёт новый на том же порту. Это обеспечивает **high availability**.

---

## Как это работает на практике

```bash
npm run start:multi
```

**Консоль:**
```
Primary process 1234 is running
Starting 11 workers...
Load balancer listening on http://localhost:4000
  → Worker 1 on port 4001
  → Worker 2 on port 4002
  → Worker 3 on port 4003
  ...
Worker 5678 listening on http://127.0.0.1:4001
Worker 5679 listening on http://127.0.0.1:4002
...
```

**Тест синхронизации:**
```bash
# POST → Worker 1
curl -X POST http://localhost:4000/api/products -d '{"name":"Test", ...}'
# ← {id: "abc123", name: "Test"}

# GET → Worker 2 (round-robin)
curl http://localhost:4000/api/products
# ← [{id: "abc123", name: "Test"}]  ✅ синхронизировано!

# DELETE → Worker 3
curl -X DELETE http://localhost:4000/api/products/abc123

# GET → Worker 1 (начинаем сначала)
curl http://localhost:4000/api/products/abc123
# ← 404  ✅ удаление синхронизировано!
```

---

## Где мог ошибиться новичок

1. **Забыть broadcast обратно при restart worker** — новый worker не получит IPC handler, синхронизация сломается

2. **Не проверять `w !== worker` при broadcast** — worker отправит сообщение сам себе → бесконечная рекурсия

3. **Использовать `cluster.fork()` без передачи `WORKER_PORT`** — все workers попытаются слушать один порт → EADDRINUSE

4. **Забыть `process.exit(1)` при ошибке в worker** — worker продолжит работать в сломанном состоянии

5. **Не обрабатывать `proxy.on('error')`** — клиент повиснет без ответа при падении worker

6. **Проверять существование ID перед добавлением в `applySync`** — без этого дубликаты продуктов при race condition

---

## Преимущества и недостатки

### ✅ Преимущества

- **Использование всех ядер CPU** — 12-ядерный процессор = 11 workers = в 11 раз больше производительность
- **High availability** — падение одного worker не убивает весь сервер
- **Zero downtime deployment** — можно перезапускать workers по одному

### ❌ Недостатки

- **Больше памяти** — каждый worker дублирует код и данные
- **Сложность синхронизации** — IPC работает только на одной машине
- **Не подходит для distributed систем** — для нескольких физических серверов нужна внешняя БД (Redis, PostgreSQL)

---

## Итог части 4

Реализовано полное горизонтальное масштабирование:
- ✅ Cluster API с `availableParallelism() - 1` workers
- ✅ Load balancer на порту 4000
- ✅ Workers на портах 4001+
- ✅ Round-robin алгоритм распределения
- ✅ IPC синхронизация БД между всеми workers
- ✅ Auto-restart упавших workers

Готово к получению **+50 баллов** за горизонтальное масштабирование.
