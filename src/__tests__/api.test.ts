import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

describe('Product API', () => {
  let app: FastifyInstance;

  before(async () => {
    app = buildApp();
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  describe('CRUD Operations', () => {
    let createdProductId: string;

    it('should return empty array when no products exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/products',
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.ok(Array.isArray(body));
      assert.strictEqual(body.length, 0);
    });

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
        payload: newProduct,
      });

      assert.strictEqual(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.ok(body.id);
      assert.strictEqual(body.name, newProduct.name);
      assert.strictEqual(body.price, newProduct.price);
      createdProductId = body.id;
    });

    it('should get product by ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/products/${createdProductId}`,
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.id, createdProductId);
      assert.strictEqual(body.name, 'Test Laptop');
    });

    it('should update product', async () => {
      const updates = {
        name: 'Updated Laptop',
        price: 1499.99,
      };

      const response = await app.inject({
        method: 'PUT',
        url: `/api/products/${createdProductId}`,
        payload: updates,
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.name, 'Updated Laptop');
      assert.strictEqual(body.price, 1499.99);
      assert.strictEqual(body.description, 'A test laptop'); // не изменилось
    });

    it('should delete product', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/products/${createdProductId}`,
      });

      assert.strictEqual(response.statusCode, 204);
      assert.strictEqual(response.body, '');
    });

    it('should return 404 for deleted product', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/products/${createdProductId}`,
      });

      assert.strictEqual(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.ok(body.message.includes('not found'));
    });
  });

  describe('Validation', () => {
    it('should return 400 for invalid UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/products/invalid-uuid',
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.ok(body.message.includes('UUID'));
    });

    it('should return 400 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/products',
        payload: { name: 'Only Name' },
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.ok(body.message.includes('required'));
    });

    it('should return 400 for negative price', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/products',
        payload: {
          name: 'Bad Product',
          description: 'Test',
          price: -100,
          category: 'test',
          inStock: true,
        },
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.ok(body.message.includes('positive'));
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent route', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/non-existent-route',
      });

      assert.strictEqual(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.ok(body.message);
    });
  });
});
