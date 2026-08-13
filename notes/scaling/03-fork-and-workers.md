# 03. fork() и воркеры

## Что такое "воркер"

Воркер (worker) — это дочерний процесс, который выполняет какую-то работу. Слово "воркер" не является техническим термином Node.js — это просто название роли. Любой дочерний процесс, запущенный через `fork`, можно назвать воркером.

```
Parent (Главный)         Workers (Воркеры)
──────────────────       ────────────────────────
- Управляет              - Выполняют реальную работу
- Координирует           - Обрабатывают запросы
- Следит за воркерами    - Могут падать и перезапускаться
```

---

## child_process.fork — как это работает

Когда ты вызываешь `fork('./worker.js')`, Node.js:

1. Просит ОС создать новый процесс
2. В новом процессе запускает Node.js runtime
3. Выполняет указанный файл (`worker.js`)
4. **Создаёт IPC канал** между родителем и дочерним процессом

```js
import { fork } from 'node:child_process';

const worker = fork('./worker.js');
//                   ↑
//           Этот файл запустится в дочернем процессе
```

Визуально:

```
Твой файл (index.js)          worker.js
┌────────────────────┐        ┌─────────────────┐
│                    │        │                 │
│  const w = fork() │◄──IPC─►│ process.on(     │
│  w.send({...})    │        │   'message', fn │
│  w.on('message')  │        │ )               │
│                    │        │                 │
└────────────────────┘        └─────────────────┘
  PID: 100                      PID: 101
```

---

## Отличие fork в Node.js от fork в Unix/C

Это важный момент, который часто путает.

**Unix fork()** — системный вызов, который создаёт **точную копию** текущего процесса. Дочерний процесс продолжает с той же строки кода, с той же памятью.

**Node.js child_process.fork()** — запускает **новый чистый процесс** с нуля, выполняющий указанный файл. Никакой копии памяти нет.

```
Unix fork():
Parent (PID 100) → создаёт → Child (PID 101)
                              ТОЧНАЯ КОПИЯ: та же память,
                              тот же код, тот же стек

Node.js fork('./worker.js'):
Parent (PID 100) → создаёт → Child (PID 101)
                              НОВЫЙ ПРОЦЕСС: чистая память,
                              запускает worker.js с начала
```

---

## Передача данных при создании воркера

Данные можно передавать двумя способами:

### Способ 1: Переменные окружения

```js
const worker = fork('./worker.js', [], {
  env: {
    ...process.env,
    WORKER_ID: '1',
    PORT: '4001',
  }
});
```

В `worker.js`:

```js
const id = process.env.WORKER_ID;     // '1'
const port = process.env.PORT;        // '4001'
```

Переменные окружения — это **строки**. Числа, объекты нужно конвертировать вручную.

### Способ 2: Сообщение после старта (через IPC)

```js
const worker = fork('./worker.js');

worker.on('online', () => {
  worker.send({ config: { port: 4001, dbUrl: 'postgres://...' } });
});
```

В `worker.js`:

```js
process.on('message', (msg) => {
  const { port, dbUrl } = msg.config;
  startServer(port, dbUrl);
});
```

---

## Несколько воркеров — массив

```js
import { fork } from 'node:child_process';

const workers = [];

for (let i = 0; i < 3; i++) {
  const worker = fork('./worker.js', [], {
    env: { ...process.env, WORKER_PORT: String(4001 + i) }
  });
  workers.push(worker);
}

workers[0].send({ task: 'ping' });
workers[1].send({ task: 'ping' });
```

---

## Обнаружение завершения воркера

```js
const worker = fork('./worker.js');

worker.on('exit', (code, signal) => {
  if (code !== 0) {
    console.log('Воркер упал! Перезапускаем...');
    const newWorker = fork('./worker.js');
  }
});

worker.on('error', (err) => {
  console.error('Ошибка воркера:', err);
});
```

---

## Чем cluster.fork() отличается от child_process.fork()

Модуль `cluster` использует `child_process.fork()` внутри, но добавляет три важные вещи:

1. **Автоматически передаёт серверный сокет** — все воркеры могут слушать на одном порту (ОС сама распределяет соединения)
2. **Встроенный round-robin** на уровне ОС (в Linux)
3. **Удобное API** — `cluster.fork()`, `cluster.workers`, события `online`, `disconnect`

```js
// child_process.fork — нужно передавать порт вручную
const w = cpFork('./worker.js', [], { env: { PORT: '4001' } });

// cluster.fork — все воркеры автоматически слушают тот же PORT
const w = cluster.fork();
```

Для HTTP-сервера с load balancing лучше использовать `cluster`. Для изолированных задач (обработка данных, CPU-работа) — `child_process.fork`.

---

## Итог

- `child_process.fork` — запускает Node.js файл как дочерний процесс с IPC
- В Node.js fork не копирует память — создаёт новый чистый процесс
- Воркер — это просто дочерний процесс с рабочей нагрузкой
- `cluster.fork` удобнее для HTTP-серверов

→ Читай `04-ipc.md`
