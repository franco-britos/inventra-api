# Inventra API

Backend for **Inventra**, a stock, sites, clients, and reporting platform for small businesses.

## Status

This project is a **work in progress**. Core inventory flows are implemented, but the API is still evolving and some routes, schemas, and docs may change.

## Tech Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Framework:** Express 5
- **ORM:** Prisma 7 with `@prisma/adapter-pg`
- **Database:** PostgreSQL
- **Auth:** JWT access/refresh tokens
- **Validation:** Zod
- **Email:** Resend
- **MFA:** TOTP (`otpauth`) and email codes

## Current Capabilities

- Authentication, password reset, and refresh tokens
- Optional MFA with TOTP and email verification codes
- Company onboarding and employee membership
- Site management for warehouses, stores, and vehicles
- Product management with archiving support
- Inventory receive, sale, adjustment, and transfer flows
- Weighted average cost (WAC) tracking with persisted cost-at-sale / COGS fields
- Client management for sales workflows
- Transaction history and reporting endpoints
- Report-ready financial summary fields such as revenue, COGS, gross profit, and net stock change

## Data Model

| Model | Description |
| --- | --- |
| `Company` | Top-level tenant |
| `AppUser` | Authentication account |
| `Employee` | Links a user to a company and optional site |
| `Site` | Warehouse, store, or vehicle |
| `Product` | Company-scoped product with SKU, price, and low-stock threshold |
| `Inventory` | Quantity and weighted-average unit cost for a product at a site |
| `InventoryTransaction` | Auditable stock movement log |
| `Client` | Customer/client record used when recording sales |
| `Invite` | Employee invite flow |

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- PostgreSQL

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env` file in the project root:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/inventra"
CORS_ORIGIN="http://localhost:5173"

JWT_ACCESS_SECRET="replace-me"
JWT_REFRESH_SECRET="replace-me"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

RESEND_API_KEY=""
APP_URL="http://localhost:5173"
```

Notes:

- `RESEND_API_KEY` is optional for local development. If omitted, email sends are skipped and reset/MFA codes are logged in development/test flows where applicable.
- Use strong values for JWT secrets before deploying anywhere outside local development.

### 3. Generate Prisma client and run migrations

```bash
npm run db:generate
npm run db:migrate
```

### 4. Seed the database (optional)

```bash
npm run db:seed
```

This seeds sample companies, users, sites, products, inventory, and transactions.

### 5. Start the API

```bash
npm run dev
```

The API runs on `http://localhost:3000` by default.

## Project Structure

```text
inventra-api/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── config/
│   ├── lib/
│   ├── middleware/
│   ├── routes/
│   └── schemas/
├── generated/prisma/     # generated client (git-ignored)
├── prisma.config.ts
├── package.json
└── .env                  # local only, git-ignored
```

## Useful Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run the API in watch mode |
| `npm run start` | Run the API once |
| `npm run typecheck` | TypeScript typecheck |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Create/apply development migrations |
| `npm run db:migrate:deploy` | Apply committed migrations |
| `npm run db:seed` | Seed sample data |
| `npm run db:reset` | Reset and reseed local DB |
| `npm run test` | Run all tests |
| `npm run test:unit` | Run unit tests |
| `npm run test:integration` | Run integration tests |

## Notes

- Environment files are git-ignored. Do not commit real credentials.
- The default email sender currently uses a Resend sandbox-style sender intended for development/testing.
- Database migrations are an important part of the current project history and should stay in sync with `schema.prisma`.

## License

ISC
