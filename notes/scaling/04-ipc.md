# 04. Межпроцессное взаимодействие (IPC)

## Проблема: процессы изолированы

Мы выяснили что у каждого процесса своя память. Но как тогда они могут координировать работу? Например, если Worker 1 создал продукт, Workers 2 и 3 должны об этом узнать.

Для этого существует **IPC — Inter-Process Communication** (межпроцессное взаимодействие).

---

## Что такое IPC канал

IPC канал — это двунаправленная труба (pipe) между двумя процессами. Можно представить как WhatsApp чат между родителем и ребёнком: оба могут отправлять и получать сообщения.

```
Parent process                Child process
┌──────────────┐              ┌──────────────┐
│              │◄────IPC─────►│              │
│ child.send() │   канал      │ process.on() │
│ child.on()   │              │ process.send │
└──────────────┘              └──────────────┘
```

IPC канал создаётся **автоматически** при использовании `child_process.fork()` или `cluster.fork()`. При обычном `spawn` его нет.

---

## Отправка сообщений

### Из родителя в дочерний процесс

```js
import { fork } from 'node:child_process';

const child = fork('./worker.js');

child.send({ type: 'task', payload: { userId: 42 } });
```

### Из дочернего процесса в родителя

```js
process.send({ type: 'result', data: { status: 'done' } });
```

**Важно:** `process.send()` существует только в дочерних процессах. Если вызвать его в обычном скрипте — будет `undefined` или ошибка. Всегда проверяй:

```js
if (process.send) {
  process.send({ type: 'ready' });
}
```

---

## Получение сообщений

### Родитель слушает сообщения от дочернего

```js
const child = fork('./worker.js');

child.on('message', (msg) => {
  console.log('Пришло сообщение:', msg);
  // msg — это объект { type: 'result', data: {...} }
});
```

### Дочерний слушает сообщения от родителя

```js
process.on('message', (msg) => {
  console.log('Получил задание:', msg);
  
  const result = doWork(msg.payload);
  
  process.send({ type: 'result', data: result });
});
```

---

## Тип данных в сообщениях

Сообщения автоматически **сериализуются в JSON**. Это значит:
- Можно передавать объекты, массивы, строки, числа, булевы значения
- Нельзя передавать функции, классы, Map, Set, undefined
- Нельзя передавать большие бинарные данные (для этого есть SharedArrayBuffer)

```js
child.send({ ok: true });              // ✅
child.send([1, 2, 3]);                 // ✅
child.send('hello');                   // ✅
child.send(42);                        // ✅

child.send(() => {});                  // ❌ функции не передаются
child.send(new Map());                 // ❌ Map теряет данные
child.send(undefined);                 // ❌ не будет отправлено
```

---

## Полный пример: задача + результат

```js
import { fork } from 'node:child_process';

const worker = fork('./calculator.js');

worker.send({ operation: 'sum', numbers: [1, 2, 3, 4, 5] });

worker.on('message', (msg) => {
  console.log('Результат:', msg.result); // 15
  worker.kill();
});
```

В `calculator.js`:

```js
process.on('message', (msg) => {
  if (msg.operation === 'sum') {
    const result = msg.numbers.reduce((a, b) => a + b, 0);
    process.send({ result });
  }
});
```

---

## Broadcast — отправить всем воркерам

Это паттерн, который мы используем в нашем проекте. Когда один воркер меняет данные, нужно уведомить всех остальных.

```js
import cluster from 'node:cluster';

const workers = [];

for (let i = 0; i < 3; i++) {
  workers.push(cluster.fork());
}

workers.forEach((worker) => {
  worker.on('message', (msg) => {
    if (msg.type === 'sync') {
      workers.forEach((w) => {
        if (w !== worker) {
          w.send(msg);
        }
      });
    }
  });
});
```

**Схема работы:**

```
Worker 1 создаёт продукт
    ↓
Worker 1 отправляет sync сообщение Primary
    ↓
Primary получает сообщение от Worker 1
    ↓
Primary рассылает сообщение Workers 2 и 3 (но не Worker 1!)
    ↓
Workers 2 и 3 получают сообщение
    ↓
Workers 2 и 3 применяют изменение в своей памяти
```

---

## Почему `w !== worker` при broadcast

Это защита от повторного применения изменения.

Worker 1 **уже добавил** продукт в свою память (`products.push(product)`). Если мы отправим ему же это сообщение обратно и он снова вызовет `applySync` — будет дубликат.

```js
workers.forEach((w) => {
  if (w !== worker) {   // не отправляем отправителю
    w.send(msg);
  }
});
```

---

## Другие механизмы IPC в Node.js

IPC канал — не единственный способ. Вот полный список:

| Механизм | Описание | Когда использовать |
|----------|----------|--------------------|
| IPC pipe (`process.send`) | Встроенный, только для fork | Общение parent↔child |
| Сокеты (TCP/Unix) | Через `net` модуль | Любые процессы на одной машине |
| HTTP/REST | Обычные HTTP запросы | Разные машины, микросервисы |
| Redis Pub/Sub | Через внешний брокер | Множество машин, production |
| MessageChannel | Для Worker Threads | Потоки внутри одного процесса |

В нашем проекте мы используем IPC pipe как самый простой вариант для одной машины.

---

## Ограничения IPC

1. **Работает только на одной машине** — не для distributed систем
2. **Синхронизация не мгновенная** — между отправкой и получением есть задержка
3. **JSON сериализация** — не для бинарных данных
4. **Race conditions** — если два воркера одновременно изменяют данные, возможны конфликты

Для production приложений с несколькими машинами используют Redis или другой внешний брокер сообщений.

---

## Итог

- IPC канал — двунаправленная труба между процессами
- `process.send(msg)` — отправить сообщение родителю
- `child.send(msg)` — отправить сообщение дочернему
- `process.on('message', fn)` — получить сообщение
- Сообщения сериализуются в JSON автоматически
- Broadcast = отправить всем кроме отправителя

→ Читай `05-cluster.md`
