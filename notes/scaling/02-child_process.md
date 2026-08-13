# 02. Модуль child_process

## Зачем он нужен

`child_process` — встроенный модуль Node.js для запуска дочерних процессов. С его помощью можно:
- Запустить любую программу (shell-команду, Python-скрипт, другой Node.js файл)
- Получить результат её работы
- Общаться с ней в процессе выполнения

```js
import { spawn, fork, exec } from 'node:child_process';
```

---

## Три основных метода

### `exec` — выполнить команду и получить результат целиком

Подходит для коротких команд, результат которых нужен целиком.

```js
import { exec } from 'node:child_process';

exec('ls -la', (error, stdout, stderr) => {
  if (error) {
    console.error('Ошибка:', error.message);
    return;
  }
  console.log(stdout);
});
```

**Ограничение:** буферизует весь вывод в памяти. Если команда выводит много данных (гигабайты логов) — упадёт с ошибкой `maxBuffer exceeded`.

**Когда использовать:** простые команды с небольшим выводом (`git status`, `npm --version`).

---

### `spawn` — запустить процесс и работать с потоком данных

Не буферизует — данные приходят по мере появления через стримы.

```js
import { spawn } from 'node:child_process';

const child = spawn('node', ['worker.js']);

child.stdout.on('data', (data) => {
  console.log('Получили данные:', data.toString());
});

child.stderr.on('data', (data) => {
  console.error('Ошибка в дочернем процессе:', data.toString());
});

child.on('close', (code) => {
  console.log(`Процесс завершился с кодом ${code}`);
});
```

**Когда использовать:** долгоживущие процессы, большие объёмы данных, нужны стримы.

---

### `fork` — специальный spawn для Node.js файлов

`fork` — это `spawn` с одним важным дополнением: **автоматически создаётся IPC канал** между родителем и дочерним процессом. Только для Node.js скриптов.

```js
import { fork } from 'node:child_process';

const child = fork('./worker.js');

child.send({ task: 'processData', data: [1, 2, 3] });

child.on('message', (result) => {
  console.log('Результат:', result);
});
```

**В `worker.js`:**

```js
process.on('message', (msg) => {
  const result = msg.data.reduce((a, b) => a + b, 0);
  process.send({ sum: result });
});
```

**Когда использовать:** нужно запустить другой `.js` файл и общаться с ним через сообщения.

---

## Сравнительная таблица

| Метод | Для чего | IPC | Стримы | Тип данных |
|-------|----------|-----|--------|------------|
| `exec` | Короткие команды | ❌ | ❌ | Буфер целиком |
| `spawn` | Любые процессы | ❌ | ✅ | Поток данных |
| `fork` | Node.js файлы | ✅ | ✅ | Сообщения (JSON) |

---

## Что такое IPC канал

IPC (Inter-Process Communication) — это труба между двумя процессами, по которой можно передавать сообщения. Подробнее — в `04-ipc.md`.

Важно понять: `exec` и `spawn` этого канала **не имеют**. Их дочерний процесс может только писать в stdout/stderr. `fork` специально создан для Node.js и даёт возможность двустороннего общения через `process.send()` и `process.on('message')`.

---

## Практический пример: CPU-интенсивная задача

Представь: нужно найти факториал от очень большого числа. Это заблокирует event loop Node.js на секунды.

**Без child_process — сервер зависает:**

```js
app.get('/factorial', (req, res) => {
  const result = heavyCalculation(1_000_000); // event loop заблокирован!
  res.send({ result });
  // Пока считается — все остальные запросы ждут
});
```

**С child_process.fork — сервер не зависает:**

```js
app.get('/factorial', (req, res) => {
  const child = fork('./factorial-worker.js');
  
  child.send({ n: 1_000_000 });
  
  child.on('message', (result) => {
    res.send(result); // ответ приходит когда вычисление завершено
    child.kill();
  });
  // Event loop свободен — другие запросы обрабатываются
});
```

---

## Дочерний процесс — копия или нет?

При создании через `fork` Node.js не копирует память. Он запускает **новый независимый процесс** с нуля, выполняя указанный файл. Это отличается от `fork()` в Unix, где создаётся точная копия процесса.

```
Parent process              Child process
runs: cluster.ts            runs: worker.js (новый)
PID: 200                    PID: 201
memory: { ... }             memory: { ... } (отдельная)
```

---

## Что дальше

`fork` в модуле `child_process` — это базовый инструмент. Модуль `cluster` использует его внутри, но добавляет удобства специально для HTTP-серверов.

→ Читай `03-fork-vs-cluster.md`
