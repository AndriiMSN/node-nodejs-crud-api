import { Product } from '../types/product.js';

const products: Product[] = [];

export const db = {
  findAll(): Product[] {
    return products;
  },

  findById(id: string): Product | undefined {
    return products.find((p) => p.id === id);
  },

  create(product: Product): Product {
    products.push(product);
    return product;
  },

  update(id: string, data: Partial<Product>): Product | undefined {
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) return undefined;
    products[index] = { ...products[index], ...data };
    return products[index];
  },

  delete(id: string): boolean {
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) return false;
    products.splice(index, 1);
    return true;
  },
};
