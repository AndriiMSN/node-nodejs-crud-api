# 06. Load Balancer и балансировка нагрузки

## Проблема, которую решает load balancer

Node.js однопоточный. Один процесс может обрабатывать запросы только последовательно в своём event loop. При высокой нагрузке это узкое место.

```
1000 запросов/сек → Один процесс Node.js → event loop перегружен
                                           → задержки растут
                                           → пользователи ждут
```

Load balancer решает это горизонтальным масштабированием: вместо одного мощного сервера — несколько обычных, работающих параллельно.

```
1000 запросов/сек → Load Balancer → Worker 1 (333 req/s)
                                  → Worker 2 (333 req/s)
                                  → Worker 3 (333 req/s)
```

---

## Round-Robin — алгоритм по кругу

Round-robin (RR) — самый простой алгоритм балансировки. Запросы распределяются по воркерам строго по очереди, как по кругу.

```
Запрос 1 → Worker 1
Запрос 2 → Worker 2
Запрос 3 → Worker 3
Запрос 4 → Worker 1  ← начинаем заново
Запрос 5 → Worker 2
Запрос 6 → Worker 3
...
```

Реализуется одной строкой кода:

```js
let current = 0;
const workers = [w1, w2, w3];

function getNextWorker() {
  const worker = workers[current];
  current = (current + 1) % workers.length;
  return worker;
}
```

`% workers.length` — это оператор остатка от деления. Когда `current` достигает длины массива, он сбрасывается в 0:
```
0 % 3 = 0 → w1
1 % 3 = 1 → w2
2 % 3 = 2 → w3
3 % 3 = 0 → w1  ← сброс
4 % 3 = 1 → w2
```

---

## Другие алгоритмы балансировки

Round-robin — не единственный вариант:

| Алгоритм | Принцип | Когда лучше |
|----------|---------|-------------|
| **Round-Robin** | По кругу | Одинаковые запросы, простота |
| **Least Connections** | На воркер с наименьшим числом активных соединений | Разное время обработки |
| **Random** | Случайный воркер | Нет предпочтений |
| **IP Hash** | Один клиент → всегда один воркер | Когда нужны сессии |
| **Weighted RR** | Более мощным воркерам — больше запросов | Разные характеристики серверов |

Для нашего задания требуется **Round-Robin**.

---

## HTTP Proxy — как load balancer перенаправляет запросы

Load balancer получает запрос от клиента и создаёт **новый запрос** к выбранному воркеру. Потом ответ воркера пересылает обратно клиенту.

```
Клиент отправляет:     POST /api/products → localhost:4000

Load balancer:         получает запрос
                       выбирает Worker 2 (round-robin)
                       создаёт запрос: POST /api/products → localhost:4002
                       
Worker 2 отвечает:     { id: "abc", name: "Laptop" }

Load balancer:         пересылает ответ клиенту

Клиент получает:       { id: "abc", name: "Laptop" }
```

Клиент не знает что его запрос обработал Worker 2. Он видит только `localhost:4000`.

В нашем коде это реализовано через `http.request` — создаём проксирующий запрос:

```js
import { createServer, request as httpRequest } from 'node:http';

let currentIndex = 0;
const ports = [4001, 4002, 4003];

const server = createServer((req, res) => {
  const targetPort = ports[currentIndex];
  currentIndex = (currentIndex + 1) % ports.length;

  const proxy = httpRequest({
    hostname: 'localhost',
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: req.headers,
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  req.pipe(proxy);
});

server.listen(4000);
```

Разбор строк:
- `req.url`, `req.method`, `req.headers` — берём данные входящего запроса
- `httpRequest({...}, callback)` — создаём запрос к воркеру
- `req.pipe(proxy)` — перенаправляем тело запроса (для POST/PUT)
- `proxyRes.pipe(res)` — перенаправляем ответ воркера клиенту

---

## Shared State — главная сложность

Самая сложная проблема при horizontal scaling: каждый воркер имеет **собственную копию данных** в памяти.

```
Worker 1: products = [{ id: 'abc' }]
Worker 2: products = []              ← не знает о продукте!
Worker 3: products = []              ← не знает о продукте!
```

**Запрос 1** (POST) идёт на Worker 1 → создаёт продукт в своей памяти  
**Запрос 2** (GET) идёт на Worker 2 → возвращает пустой массив ❌

### Решение 1: IPC синхронизация (наш подход)

После каждого изменения воркер отправляет сообщение primary, который рассылает его всем остальным воркерам.

```
Worker 1 создаёт продукт
  → process.send({ type: 'sync', action: 'create', data: {...} })
    → Primary получает
      → Primary рассылает Workers 2 и 3
        → Workers 2 и 3 добавляют продукт в свою память
```

Плюсы: просто, без внешних зависимостей  
Минусы: работает только на одной машине

### Решение 2: Внешняя БД (production подход)

Все воркеры обращаются к одной базе данных (PostgreSQL, MongoDB).

```
Worker 1 → PostgreSQL ← Worker 2
Worker 3 ──────↑
```

Плюсы: работает на любом количестве машин, данные не теряются  
Минусы: нужна БД, сетевые задержки

### Решение 3: Redis

Redis используется как централизованное хранилище состояния или брокер сообщений.

```
Worker 1 → Redis Pub/Sub → Workers 2, 3
                         → Workers на других машинах
```

Плюсы: быстро, масштабируется, поддерживает Pub/Sub  
Минусы: внешняя зависимость

---

## Sticky Sessions — когда round-robin не подходит

Round-robin предполагает что все запросы независимы. Но что если клиент хранит сессию?

```
Запрос 1 (логин) → Worker 1 → сессия сохранена в памяти Worker 1
Запрос 2 (профиль) → Worker 2 → сессии нет! → 401 Unauthorized
```

**Sticky Sessions (IP hash)** — один клиент всегда попадает на один воркер:

```js
function getWorkerByIp(ip) {
  const hash = ip.split('.').reduce((acc, part) => acc + parseInt(part), 0);
  return workers[hash % workers.length];
}
```

Для REST API без сессий (как наш проект) sticky sessions не нужны — каждый запрос самодостаточен.

---

## Наш проект: всё вместе

```
npm run start:multi
           ↓
    cluster.ts запускается
           ↓
cluster.isPrimary === true (первый запуск)
           ↓
availableParallelism() - 1 = N воркеров
           ↓
для каждого i: cluster.fork({ WORKER_PORT: PORT + i + 1 })
           ↓
N воркеров запускаются, cluster.isPrimary === false
           ↓
каждый воркер: buildApp() → app.listen(WORKER_PORT)
           ↓
Primary: createServer (load balancer) → server.listen(PORT)
           ↓
Запросы на PORT → round-robin → WORKER_PORT+1/+2/+3...
           ↓
IPC: worker.on('message') → broadcast → db.applySync()
```

---

## Потенциальные проблемы в нашей реализации

### Race Condition при одновременном создании

Если Worker 1 и Worker 2 одновременно создают продукт с одним UUID (крайне маловероятно с UUID v4) — будет дубликат. Поэтому в `applySync` есть проверка:

```js
case 'create':
  if (!products.find((p) => p.id === data.id)) {
    products.push(data);  // добавляем только если нет дубликата
  }
  break;
```

### IPC задержка

Синхронизация не мгновенная. Между `process.send()` и `db.applySync()` есть миллисекунды. В production с реальной БД эта проблема решается транзакциями.

### Потеря данных при перезапуске

Когда воркер рестартует после падения — его локальная память очищается. Primary мог бы отправить ему snapshot всех данных, но в нашей реализации этого нет. Это приемлемо для учебного проекта.

---

## Итог: целостная картина

```
Проблема:
Node.js однопоточный → одно ядро CPU → ограниченная нагрузка

Решение:
Cluster API → несколько процессов → несколько ядер

Новая проблема:
Много процессов → нужно распределять запросы

Решение:
Load Balancer → Round-Robin → каждый воркер получает равную нагрузку

Новая проблема:
Каждый воркер → своя память → разное состояние БД

Решение:
IPC → broadcast изменений → все воркеры синхронизированы
```

---

## Что изучить дальше

- **PM2** — менеджер процессов для production (умнее чем cluster)
- **Redis Pub/Sub** — broadcast между разными машинами
- **nginx** — профессиональный load balancer (намного мощнее нашего)
- **Kubernetes** — оркестрация контейнеров (следующий уровень scaling)
- **Worker Threads** — альтернатива процессам для CPU-задач (общая память!)
