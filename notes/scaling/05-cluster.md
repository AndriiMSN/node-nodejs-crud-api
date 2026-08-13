# 05. Модуль cluster

## Зачем cluster если есть child_process

`child_process.fork` отлично работает для изолированных задач. Но для HTTP-сервера у него есть неудобство: каждый воркер должен слушать на **отдельном порту**.

```js
// Без cluster — каждому воркеру нужен свой порт
const w1 = fork('./app.js', [], { env: { PORT: '4001' } });
const w2 = fork('./app.js', [], { env: { PORT: '4002' } });
const w3 = fork('./app.js', [], { env: { PORT: '4003' } });

// А потом ещё нужно написать load balancer вручную...
```

Модуль `cluster` решает это элегантнее — все воркеры могут слушать на **одном порту**, а ОС сама распределяет входящие соединения.

---

## Как работает cluster

```js
import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';
import Fastify from 'fastify';

if (cluster.isPrimary) {
  const numWorkers = availableParallelism() - 1;
  
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }
} else {
  const app = Fastify();
  app.get('/', async () => ({ pid: process.pid }));
  app.listen({ port: 4000 });
}
```

Ключевой момент: **один и тот же файл** выполняется всеми процессами. Разветвление происходит через `cluster.isPrimary` — в зависимости от того, кем является процесс, выполняется разный код.

---

## Что такое `cluster.isPrimary`

Когда ты запускаешь `node app.js` первый раз — это **primary процесс**. `cluster.isPrimary === true`.

Когда primary вызывает `cluster.fork()` — создаётся дочерний процесс, который запускает тот же файл, но теперь `cluster.isPrimary === false`.

```
Запуск: node cluster.ts

cluster.isPrimary = true  ← это первый запуск (primary)
  ↓
cluster.fork()            ← создаём дочерний процесс
  ↓
Дочерний процесс запускает cluster.ts снова
cluster.isPrimary = false ← это уже воркер
```

---

## `cluster.isPrimary` vs `cluster.isMaster`

`cluster.isMaster` — старое название, устарело с Node.js 16.  
`cluster.isPrimary` — актуальное название, используй его.

---

## Как ОС распределяет запросы

Когда несколько воркеров слушают один порт (4000), операционная система получает входящее соединение и решает, какому воркеру его передать.

**На Linux** (по умолчанию): round-robin на уровне ОС. Запросы распределяются по кругу.

**На Windows**: первый воркер, готовый принять соединение, получает его. Это может создать неравномерную нагрузку.

**Явный round-robin** (как в нашем проекте): primary процесс сам является HTTP proxy и вручную решает, на какой порт (4001, 4002, 4003...) пересылать запрос. Так поведение одинаково на всех ОС.

---

## Ключевые части API

### `cluster.fork(env?)`

Создаёт воркер. Опционально принимает дополнительные переменные окружения.

```js
const worker = cluster.fork();
const workerWithEnv = cluster.fork({ WORKER_PORT: '4001' });
```

Возвращает объект `Worker` с методами `send()`, `kill()` и событиями.

### `cluster.workers`

Объект со всеми живыми воркерами, индексированный по их ID.

```js
Object.values(cluster.workers).forEach((worker) => {
  worker.send({ type: 'broadcast', msg: 'hello' });
});
```

### `cluster.on('exit', callback)`

Срабатывает когда воркер завершается.

```js
cluster.on('exit', (worker, code, signal) => {
  console.log(`Worker ${worker.process.pid} умер`);
  console.log(`Код выхода: ${code}, сигнал: ${signal}`);
  
  cluster.fork(); // Перезапускаем
});
```

### `worker.on('online', callback)`

Воркер запустился и готов к работе.

```js
const worker = cluster.fork();

worker.on('online', () => {
  console.log(`Worker ${worker.process.pid} готов`);
});
```

### `worker.send(msg)` и `worker.on('message')`

Аналог IPC из `child_process` — для синхронизации данных между воркерами.

---

## Жизненный цикл воркера

```
cluster.fork()
    ↓
'fork' событие  ← воркер создан, но ещё не запущен
    ↓
'online' событие ← воркер запустился и работает
    ↓
worker.on('message')  ← обмен сообщениями
    ↓
'disconnect' событие  ← IPC канал закрывается
    ↓
'exit' событие  ← воркер завершился
```

---

## Auto-restart при падении

Это обязательный паттерн в production приложениях:

```js
cluster.on('exit', (worker, code, signal) => {
  if (signal) {
    console.log(`Worker убит сигналом: ${signal}`);
  } else if (code !== 0) {
    console.log(`Worker упал с кодом: ${code}. Перезапускаем...`);
    cluster.fork();
  } else {
    console.log('Worker завершился нормально');
  }
});
```

---

## Разница: cluster.fork vs стандартное распределение

В нашем проекте мы используем **нестандартный подход**: каждый воркер слушает на отдельном порту (4001, 4002, 4003...), а primary является HTTP proxy.

Это сделано потому что нам нужна **детерминированная синхронизация**: мы знаем какой именно воркер обработал запрос.

**Стандартный подход (один порт для всех):**

```
Client → Port 4000 → ОС распределяет → Worker 1 / Worker 2 / Worker 3
```

Плюсы: просто, минимум кода  
Минусы: нельзя контролировать распределение, сложнее с синхронизацией

**Наш подход (proxy):**

```
Client → Port 4000 → Primary (HTTP proxy, round-robin) → Port 4001 / 4002 / 4003
```

Плюсы: полный контроль над распределением, явный round-robin  
Минусы: больше кода, дополнительный overhead на proxy

---

## Итог

- `cluster` — надстройка над `child_process.fork` для HTTP-серверов
- Один файл — разное поведение через `cluster.isPrimary`
- `cluster.fork()` — создать воркер
- `cluster.on('exit')` — перезапуск упавших воркеров
- `cluster.workers` — все живые воркеры

→ Читай `06-load-balancer.md`
