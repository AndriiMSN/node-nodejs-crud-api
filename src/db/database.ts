import { Product } from '../types/product.js';

const products: Product[] = [];

function broadcastToWorkers(action: string, data: any) {
  if (process.send) {
    process.send({ type: 'sync', action, data });
  }
}

export const db = {
  findAll(): Product[] {
    return products;
  },

  findById(id: string): Product | undefined {
    return products.find((p) => p.id === id);
  },

  create(product: Product): Product {
    products.push(product);
    broadcastToWorkers('create', product);
    return product;
  },

  update(id: string, data: Partial<Product>): Product | undefined {
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) return undefined;
    products[index] = { ...products[index], ...data };
    broadcastToWorkers('update', { id, data });
    return products[index];
  },

  delete(id: string): boolean {
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) return false;
    products.splice(index, 1);
    broadcastToWorkers('delete', { id });
    return true;
  },

  applySync(action: string, data: any) {
    switch (action) {
      case 'create':
        if (!products.find((p) => p.id === data.id)) {
          products.push(data);
        }
        break;
      case 'update':
        const updateIndex = products.findIndex((p) => p.id === data.id);
        if (updateIndex !== -1) {
          products[updateIndex] = { ...products[updateIndex], ...data.data };
        }
        break;
      case 'delete':
        const deleteIndex = products.findIndex((p) => p.id === data.id);
        if (deleteIndex !== -1) {
          products.splice(deleteIndex, 1);
        }
        break;
    }
  },
};
