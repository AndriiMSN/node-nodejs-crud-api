export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  inStock: boolean;
}

export type CreateProductDto = Omit<Product, 'id'>;
export type UpdateProductDto = Partial<CreateProductDto>;
