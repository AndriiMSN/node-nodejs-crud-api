# Часть 2: CRUD API — Product Catalog

## Цель

Реализовать пять HTTP endpoints для управления продуктами: создание, чтение (одного и всех), обновление и удаление. Каждый endpoint должен правильно валидировать входные данные и возвращать корректные HTTP статус-коды.

---

## Ключевые концепции

### Что такое CRUD?

CRUD — аббревиатура четырёх базовых операций с данными:

| Буква | Операция | HTTP метод | Наш endpoint |
|-------|----------|-----------|--------------|
| **C** | Create   | POST      | `POST /api/products` |
| **R** | Read     | GET       | `GET /api/products`, `GET /api/products/:id` |
| **U** | Update   | PUT       | `PUT /api/products/:id` |
| **D** | Delete   | DELETE    | `DELETE /api/products/:id` |

### Что такое UUID?

UUID (Universally Unique Identifier) — это стандартный формат уникального идентификатора:
```
8d7636bf-2a62-4d1d-b1da-155dbce460eb
```
Состоит из 32 шестнадцатеричных символов, разделённых дефисами. Вероятность коллизии (совпадения двух UUID) практически нулевая — поэтому их используют как ID в базах данных без централизованного генератора.

---

## Разбор каждого endpoint

### 1. GET `/api/products` — получить все продукты

```ts
app.get('/api/products', async (_request, reply) => {
  return reply.status(200).send(db.findAll());
});
```

**Почему `_request` с подчёркиванием?**
В TypeScript соглашение: если параметр не используется, добавляем `_` в начало имени. Это говорит TypeScript "я знаю что параметр есть, но намеренно его не использую" — иначе strict mode выдаст предупреждение.

**Почему всегда 200, даже если список пуст?**
Пустой массив `[]` — это валидный ответ. 404 означает "ресурс не найден", а `/api/products` как ресурс существует всегда.

---

### 2. GET `/api/products/:productId` — получить один продукт

```ts
app.get<{ Params: { productId: string } }>(
  '/api/products/:productId',
  async (request, reply) => {
    const { productId } = request.params;

    if (!isUUID(productId)) {
      return reply.status(400).send({ message: 'Invalid productId: must be a valid UUID' });
    }

    const product = db.findById(productId);
    if (!product) {
      return reply.status(404).send({ message: `Product with id ${productId} not found` });
    }

    return reply.status(200).send(product);
  },
);
```

**Почему дженерик `app.get<{ Params: { productId: string } }>`?**
Fastify написан на TypeScript и использует дженерики для типизации `request.params`, `request.body` и т.д. Без дженерика TypeScript не знает структуру параметров.

**Порядок проверок — критически важен!**
```
1. Проверка валидности UUID → 400
2. Поиск в БД → 404 если не найдено
3. Успешный ответ → 200
```
Если проверять в другом порядке и сначала искать в БД — при строке `"not-a-uuid"` может вернуться 404 вместо 400, что неверно по заданию.

**Подводный камень UUID-валидации:**
Встроенный `crypto` модуль Node.js **не экспортирует** функцию `validate`. Правильный способ — пакет `uuid`:
```ts
import { validate as isUUID } from 'uuid'; // ✅
import { validate as isUUID } from 'crypto'; // ❌ такого нет
```

---

### 3. POST `/api/products` — создать продукт

```ts
app.post<{ Body: CreateProductDto }>('/api/products', async (request, reply) => {
  const { name, description, price, category, inStock } = request.body ?? {};

  if (
    typeof name !== 'string' ||
    typeof description !== 'string' ||
    typeof category !== 'string' ||
    typeof inStock !== 'boolean'
  ) {
    return reply.status(400).send({ message: 'Missing or invalid required fields' });
  }
  if (typeof price !== 'number' || price <= 0) {
    return reply.status(400).send({ message: 'Price must be a positive number' });
  }

  const product = db.create({ id: randomUUID(), name, description, price, category, inStock });
  return reply.status(201).send(product);
});
```

**Почему `request.body ?? {}`?**
Если клиент отправит POST запрос без тела (`Content-Type` не задан), `request.body` может быть `null` или `undefined`. `?? {}` защищает от `Cannot destructure property 'name' of undefined`.

**Почему ручная валидация вместо JSON Schema?**
Fastify поддерживает автоматическую валидацию через JSON Schema (`schema: { body: {...} }`), но для учебных целей ручная валидация лучше показывает логику. В продакшн коде лучше использовать JSON Schema или Zod.

**Почему `typeof inStock !== 'boolean'` а не `!inStock`?**
Потому что `false` — это валидное значение для `inStock`. Если написать `!inStock`, то `inStock: false` тоже вернёт 400, что неверно. Всегда проверяем **тип**, а не **истинность** для булевых значений.

**`randomUUID()` из `crypto`:**
```ts
import { randomUUID } from 'crypto'; // встроенный модуль Node.js
const id = randomUUID(); // "8d7636bf-2a62-4d1d-b1da-155dbce460eb"
```
UUID генерируется **на сервере** при создании продукта. Клиент никогда не передаёт `id`.

**Статус 201 Created** — специальный код для успешного создания ресурса, отличается от 200 OK.

---

### 4. PUT `/api/products/:productId` — обновить продукт

```ts
app.put<{ Params: { productId: string }; Body: CreateProductDto }>(
  '/api/products/:productId',
  async (request, reply) => {
    const { productId } = request.params;

    if (!isUUID(productId)) {
      return reply.status(400).send({ message: 'Invalid productId: must be a valid UUID' });
    }

    const existing = db.findById(productId);
    if (!existing) {
      return reply.status(404).send({ message: `Product with id ${productId} not found` });
    }

    const updated = db.update(productId, request.body);
    return reply.status(200).send(updated);
  },
);
```

**PUT vs PATCH:**
- **PUT** — полная замена объекта. Клиент присылает весь объект целиком.
- **PATCH** — частичное обновление. Клиент присылает только изменённые поля.

В задании требуется PUT. Наш `db.update` использует spread оператор:
```ts
products[index] = { ...products[index], ...data };
```
Это работает как частичный PUT — если прислать не все поля, остальные сохранятся. В строгом REST это было бы PATCH, но для учебного задания достаточно.

---

### 5. DELETE `/api/products/:productId` — удалить продукт

```ts
app.delete<{ Params: { productId: string } }>(
  '/api/products/:productId',
  async (request, reply) => {
    const { productId } = request.params;

    if (!isUUID(productId)) {
      return reply.status(400).send({ message: 'Invalid productId: must be a valid UUID' });
    }

    const deleted = db.delete(productId);
    if (!deleted) {
      return reply.status(404).send({ message: `Product with id ${productId} not found` });
    }

    return reply.status(204).send();
  },
);
```

**Статус 204 No Content** — успешное удаление без тела ответа. Тело пустое — удалять нечего возвращать.

**Почему `db.delete` возвращает `boolean`?**
Чтобы узнать, существовал ли элемент. Если `false` — элемент не нашли (404). Если `true` — удалили успешно (204).

---

## In-memory база данных (`database.ts`)

```ts
const products: Product[] = []; // Приватный массив — недоступен снаружи модуля

export const db = {
  findAll(): Product[]           // Вернуть все
  findById(id: string)           // Найти по ID
  create(product: Product)       // Добавить в массив
  update(id: string, data)       // Найти по индексу, merge через spread
  delete(id: string): boolean    // Найти и splice(index, 1)
};
```

**Почему не `Map<string, Product>`?**
Можно использовать и Map — поиск по ключу O(1) против O(n) у массива. Но для учебного задания с небольшим количеством продуктов разницы нет, а с массивом код проще и понятнее.

**`splice(index, 1)` — что это?**
```ts
const arr = ['a', 'b', 'c'];
arr.splice(1, 1); // Удалить 1 элемент начиная с индекса 1
// arr = ['a', 'c']
```

---

## Fastify плагин (`productRoutes`)

```ts
export async function productRoutes(app: FastifyInstance) { ... }
```

В Fastify маршруты регистрируются как **плагины** — асинхронные функции принимающие экземпляр Fastify. Это позволяет изолировать маршруты, добавлять prefix и middleware для конкретных групп маршрутов.

```ts
// app.ts
app.register(productRoutes);

// Можно добавить prefix:
app.register(productRoutes, { prefix: '/v1' }); // → /v1/api/products
```

---

## Таблица HTTP статус-кодов

| Код | Название | Когда используем |
|-----|----------|-----------------|
| 200 | OK | Успешный GET, PUT |
| 201 | Created | Успешный POST |
| 204 | No Content | Успешный DELETE |
| 400 | Bad Request | Неверный UUID, отсутствующие поля, цена ≤ 0 |
| 404 | Not Found | Продукт не найден, несуществующий маршрут |
| 500 | Internal Server Error | Непойманное исключение на сервере |

---

## Где мог ошибиться новичок

1. **Возвращать 404 для невалидного UUID** — правильно: невалидный UUID это `400 Bad Request` (плохой запрос от клиента), не `404 Not Found`
2. **Не проверять `inStock` на тип** — `if (!inStock)` отклонит `inStock: false`
3. **Возвращать 200 для DELETE** — правильно `204 No Content`
4. **Забыть `?? {}` у `request.body`** — краш при пустом теле запроса
5. **Не добавить `return`** перед `reply.status(...).send(...)` — Fastify выдаст ошибку "Reply already sent" если код продолжит выполнение после ранней отправки ответа

---

## Итог части 2

Реализованы все 5 CRUD endpoints для `/api/products`. Валидация UUID и обязательных полей работает корректно. Все требуемые HTTP статус-коды возвращаются правильно. API протестировано вручную.
