# Материалы по горизонтальному масштабированию

Читай файлы строго по порядку — каждый строится на предыдущем.

| Файл | Тема | Ключевые концепции |
|------|------|--------------------|
| `01-processes.md` | Процессы в ОС | PID, изоляция памяти, зачем несколько процессов |
| `02-child_process.md` | Модуль child_process | spawn, exec, fork — разница и применение |
| `03-fork-and-workers.md` | fork() и воркеры | Что такое воркер, передача данных, auto-restart |
| `04-ipc.md` | IPC | process.send(), события message, broadcast паттерн |
| `05-cluster.md` | Модуль cluster | isPrimary, cluster.fork(), жизненный цикл воркера |
| `06-load-balancer.md` | Load Balancer | Round-robin, HTTP proxy, Shared State, sticky sessions |

## Связь с кодом проекта

После прочтения теории — сопоставь с реальным кодом:

| Концепция | Файл в проекте |
|-----------|----------------|
| Cluster + workers | `src/cluster.ts` |
| IPC синхронизация (broadcast) | `src/cluster.ts` → `worker.on('message')` |
| applySync (получение изменений) | `src/db/database.ts` → `applySync()` |
| broadcastToWorkers (отправка изменений) | `src/db/database.ts` → `broadcastToWorkers()` |
| Round-robin алгоритм | `src/cluster.ts` → `currentWorkerIndex` |
| HTTP Proxy | `src/cluster.ts` → `httpRequest()` |
