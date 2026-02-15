# Inventra API

Backend for **Inventra** — a stock management and reporting solution for small businesses. Built with Express, TypeScript, Prisma ORM 7, and PostgreSQL.

## Tech Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Framework:** Express 5
- **ORM:** Prisma 7 (with `@prisma/adapter-pg` driver adapter)
- **Database:** PostgreSQL 15

## Data Model

| Model                | Description                                    |
| -------------------- | ---------------------------------------------- |
| Company              | Top-level tenant                               |
| AppUser              | Authentication account (email/password)        |
| Employee             | Links a user to a company and optional location |
| Location             | Warehouse or store belonging to a company      |
| Product              | Company-scoped product with SKU and price      |
| Inventory            | Stock quantity of a product at a location       |
| InventoryTransaction | Auditable log of stock changes (sale, purchase, transfer, adjustment, return) |

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Docker](https://www.docker.com/) (for local PostgreSQL)

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/franco-britos/inventra-api.git
cd inventra-api
npm install
```

### 2. Start PostgreSQL

```bash
docker run -d \
  --name inventra-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=inventra \
  -p 5432:5432 \
  postgres:15
```

### 3. Configure environment

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/inventra"
```

### 4. Generate Prisma Client and run migrations

```bash
npx prisma generate
npx prisma migrate dev
```

### 5. Seed the database (optional)

```bash
npx prisma db seed
```

This populates the database with sample companies, users, locations, products, inventory, and transactions.

## Project Structure

```
inventra-api/
├── src/                  # Application source code
│   └── index.ts          # Entry point
├── prisma/
│   ├── schema.prisma     # Database schema
│   ├── seed.ts           # Seed script
│   ├── migrations/       # Migration history
│   └── tsconfig.json     # TypeScript config for prisma files
├── generated/prisma/     # Auto-generated Prisma Client (git-ignored)
├── prisma.config.ts      # Prisma configuration
├── tsconfig.json         # TypeScript config
├── package.json
└── .env                  # Environment variables (git-ignored)
```

## Useful Commands

| Command                     | Description                          |
| --------------------------- | ------------------------------------ |
| `npx prisma generate`      | Regenerate Prisma Client             |
| `npx prisma migrate dev`   | Create and apply a new migration     |
| `npx prisma migrate reset` | Reset database and re-seed           |
| `npx prisma db seed`       | Run the seed script                  |
| `npx prisma studio`        | Open Prisma Studio (visual DB editor)|

## License

ISC
