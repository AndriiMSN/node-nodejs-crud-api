# CRUD API — Product Catalog

REST API for managing a product catalog, built with **Fastify** and **TypeScript**.

## Requirements

- Node.js 24.x.x
- npm

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and set the port:

```bash
cp .env.example .env
```

`.env.example`:
```
PORT=4000
```

## Running

### Development mode (with hot reload)
```bash
npm run start:dev
```

### Production mode (build + run)
```bash
npm run start:prod
```

### Tests
```bash
npm test
```

## API Endpoints

Base URL: `http://localhost:4000`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | Get all products |
| GET | `/api/products/:productId` | Get product by ID |
| POST | `/api/products` | Create a new product |
| PUT | `/api/products/:productId` | Update a product |
| DELETE | `/api/products/:productId` | Delete a product |

## Product Schema

```json
{
  "id": "uuid (auto-generated)",
  "name": "string (required)",
  "description": "string (required)",
  "price": "number > 0 (required)",
  "category": "string (required)",
  "inStock": "boolean (required)"
}
```

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 204 | No Content (deleted) |
| 400 | Bad Request (invalid UUID or missing fields) |
| 404 | Not Found |
| 500 | Internal Server Error |

## Example

```bash
# Create a product
curl -X POST http://localhost:4000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Laptop","description":"A laptop","price":999.99,"category":"electronics","inStock":true}'

# Get all products
curl http://localhost:4000/api/products
```
