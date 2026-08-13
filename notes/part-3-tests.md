# Часть 3: Тесты API

## Цель

Протестировать все endpoints API с помощью встроенного Node.js test runner. Минимум 3 сценария, по заданию можно получить **+30 баллов**.

---

## Ключевые концепции

### Node.js Test Runner

С версии Node.js 18 появился встроенный test runner (стабилен с v20). Не требует установки Jest, Mocha или других библиотек.

**Основные функции:**
```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

describe('Test Suite', () => {      // Группировка тестов
  before(async () => { ... });      // Запускается один раз перед всеми тестами
  after(async () => { ... });       // Запускается один раз после всех тестов
  
  it('test case', async () => {     // Отдельный тест
    assert.strictEqual(a, b);       // Проверка
  });
});
```

### Fastify `.inject()` — тестирование без HTTP

Вместо реального HTTP сервера используем **`app.inject()`**:

```ts
const response = await app.inject({
  method: 'GET',
  url: '/api/products',
});
```

**Почему это лучше чем `fetch()`?**
- Не нужно запускать сервер на реальном порту
- Быстрее (нет сетевых запросов)
- Не конфликтует с другими процессами
- Работает синхронно с тестами

`.inject()` — это Fastify API для симуляции HTTP запросов без открытия сокета.

---

## Разбор тестов

### 1. Setup и Teardown

```ts
let app: FastifyInstance;

before(async () => {
  app = buildApp();
  await app.ready();      // Ждём инициализации плагинов
});

after(async () => {
  await app.close();      // Закрываем соединения
});
```

**Зачем `app.ready()`?**
Fastify загружает плагины асинхронно. `.ready()` гарантирует, что все маршруты зарегистрированы до начала тестов.

**Зачем `app.close()`?**
Освобождает ресурсы. Без этого тесты могут "висеть" после завершения.

---

### 2. CRUD Operations — полный цикл

```ts
let createdProductId: string;  // Сохраняем ID между тестами
```

Тесты выполняются **последовательно** (по умолчанию в Node.js test runner). Каждый следующий тест зависит от предыдущего:

1. **GET all** — проверяем пустой массив
2. **POST** — создаём продукт, сохраняем `id`
3. **GET by ID** — находим созданный продукт по `id`
4. **PUT** — обновляем поля
5. **DELETE** — удаляем по `id`
6. **GET by ID** — проверяем 404

**Почему тесты не изолированы?**
Для учебных целей это нормально — показывает реальный workflow. В продакшн коде лучше изолировать (каждый тест создаёт свои данные).

---

### 3. Assertion — `assert.strictEqual` vs `assert.ok`

```ts
assert.strictEqual(response.statusCode, 200);  // Точное равенство (===)
assert.ok(body.id);                            // Проверка truthy значения
```

**`strictEqual`** — жёсткое сравнение без приведения типов:
```ts
assert.strictEqual(1, 1);      // ✅
assert.strictEqual(1, '1');    // ❌ разные типы
```

**`ok`** — проверяет что значение truthy:
```ts
assert.ok('any string');  // ✅
assert.ok(0);             // ❌ falsy
assert.ok(null);          // ❌ falsy
```

---

### 4. Тест создания продукта

```ts
it('should create a new product', async () => {
  const newProduct = {
    name: 'Test Laptop',
    description: 'A test laptop',
    price: 1299.99,
    category: 'electronics',
    inStock: true,
  };

  const response = await app.inject({
    method: 'POST',
    url: '/api/products',
    payload: newProduct,  // Тело запроса
  });

  assert.strictEqual(response.statusCode, 201);
  const body = JSON.parse(response.body);  // response.body — строка
  assert.ok(body.id);                      // UUID должен сгенерироваться
  createdProductId = body.id;              // Сохраняем для следующих тестов
});
```

**Почему `JSON.parse(response.body)`?**
`.inject()` возвращает `response.body` как строку, а не объект. Всегда нужен parse.

---

### 5. Тест обновления (PUT)

```ts
it('should update product', async () => {
  const updates = {
    name: 'Updated Laptop',
    price: 1499.99,
  };  // Частичное обновление

  const response = await app.inject({
    method: 'PUT',
    url: `/api/products/${createdProductId}`,
    payload: updates,
  });

  const body = JSON.parse(response.body);
  assert.strictEqual(body.name, 'Updated Laptop');  // Изменилось
  assert.strictEqual(body.description, 'A test laptop');  // Не изменилось
});
```

Проверяем что:
1. Изменённые поля обновились
2. Неизменённые поля остались прежними

---

### 6. Тест удаления (DELETE)

```ts
it('should delete product', async () => {
  const response = await app.inject({
    method: 'DELETE',
    url: `/api/products/${createdProductId}`,
  });

  assert.strictEqual(response.statusCode, 204);
  assert.strictEqual(response.body, '');  // 204 не возвращает тело
});
```

**Важно:** 204 No Content означает пустое тело. Если тело не пустое — это нарушение спецификации HTTP.

---

### 7. Валидация — проверка ошибок

```ts
it('should return 400 for invalid UUID', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/products/invalid-uuid',
  });

  assert.strictEqual(response.statusCode, 400);
  const body = JSON.parse(response.body);
  assert.ok(body.message.includes('UUID'));  // Проверяем что сообщение понятное
});
```

Тестируем **негативные сценарии** — что происходит при неправильных данных:
- Невалидный UUID → 400
- Отсутствующие поля → 400
- Отрицательная цена → 400

---

### 8. Тестирование 404

```ts
it('should return 404 for non-existent route', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/non-existent-route',
  });

  assert.strictEqual(response.statusCode, 404);
  const body = JSON.parse(response.body);
  assert.ok(body.message);  // Есть понятное сообщение об ошибке
});
```

Проверяем что `app.setNotFoundHandler()` работает корректно.

---

## Запуск тестов

```bash
npm test
```

Под капотом:
```json
"test": "tsx --test src/__tests__/api.test.ts"
```

**Почему `tsx --test`?**
- `tsx` — запускает TypeScript файлы напрямую
- `--test` — флаг для Node.js test runner
- Без `tsx` пришлось бы сначала компилировать `.ts` → `.js`

---

## Структура вывода

```
▶ Product API
  ▶ CRUD Operations
    ✔ should return empty array when no products exist
    ✔ should create a new product
    ✔ should get product by ID
    ✔ should update product
    ✔ should delete product
    ✔ should return 404 for deleted product
  ✔ CRUD Operations (33.77ms)
  
ℹ tests 10
ℹ pass 10
ℹ fail 0
```

- `▶` — группа тестов (describe)
- `✔` — успешный тест
- `✖` — провалившийся тест (с описанием ошибки)

---

## Где мог ошибиться новичок

1. **Забыть `await app.ready()`** — тесты начнут выполняться до регистрации маршрутов → все 404

2. **Не закрыть app** — тесты завершатся, но процесс будет висеть

3. **Не делать `JSON.parse(response.body)`** — `response.body` это строка, попытка обратиться к `.id` вернёт `undefined`

4. **Запустить тесты параллельно** — если тесты зависят от порядка (как наши CRUD тесты), параллельный запуск их сломает

5. **Проверять `response.body` для 204** — 204 всегда пустое тело, `JSON.parse('')` выбросит ошибку

6. **Использовать `==` вместо `strictEqual`** — может скрыть баги с типами (`1 == '1'` true, но это разные типы)

---

## Итог части 3

Реализовано **10 тестов** (больше минимума 3):
- ✅ 6 тестов полного CRUD цикла
- ✅ 3 теста валидации
- ✅ 1 тест обработки 404

Все тесты проходят. Готово к получению **+30 баллов** за тестирование.
