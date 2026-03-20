import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { validate as isUUID } from 'uuid';
import { db } from '../db/database.js';
import { CreateProductDto, UpdateProductDto } from '../types/product.js';

export async function productRoutes(app: FastifyInstance) {
  app.get('/api/products', async (_request, reply) => {
    return reply.status(200).send(db.findAll());
  });

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

  app.put<{ Params: { productId: string }; Body: UpdateProductDto }>(
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
}
