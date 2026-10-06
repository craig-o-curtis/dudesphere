# The Dudesphere

## App Concept

A social network where Dudeist priests and members share **abidings** — short posts of wisdom, chill thoughts, or guidance inspired by The Big Lebowski and Dudeist philosophy.

> "The Dude abides."

## Architecture

- **Backend**: NestJS 12 with raw databases (no ORM)
- **PostgreSQL 18** (TypeORM): Users, roles, auth
- **MongoDB 8** (Mongoose): Abidings (posts), reply chains
- **Docker Compose**: All DBs run in containers; NestJS runs locally for hot-reload

## Database Schema

### PostgreSQL — `user` table

| Column      | Type           | Description           |
| ----------- | -------------- | --------------------- |
| `id`        | serial PK      | Auto-increment        |
| `name`      | varchar        | Display name          |
| `email`     | varchar UNIQUE | Login email           |
| `password`  | varchar        | Hashed password       |
| `role`      | simple-enum    | ADMIN, PRIEST, MEMBER |
| `isDude`    | boolean        | Dudeist flag          |
| `createdAt` | timestamp      | ISO string (auto)     |
| `updatedAt` | timestamp      | ISO string (auto)     |

### MongoDB — `abidings` collection

| Field       | Type       | Description                                                   |
| ----------- | ---------- | ------------------------------------------------------------- |
| `_id`       | ObjectId   | Auto-generated                                                |
| `userId`    | number     | Author reference                                              |
| `userName`  | string     | Snapshot of author name                                       |
| `message`   | string     | The abiding (1–280 chars)                                     |
| `replyToId` | string     | Parent abiding ObjectId (nullable)                            |
| `hashtags`  | string[]   | Normalized slugs, derived from `message` — never set directly |
| `createdAt` | ISO string | Auto-set by Mongoose                                          |
| `updatedAt` | ISO string | Auto-set by Mongoose                                          |

### MongoDB — `hashtags` collection

The canonical list of every tag ever used, so a tag can be listed or looked up
without scanning abidings. The relationship itself lives in `abidings.hashtags`
— see [hashtag-plan.md](hashtag-plan.md).

| Field         | Type       | Description                             |
| ------------- | ---------- | --------------------------------------- |
| `_id`         | ObjectId   | Auto-generated                          |
| `slug`        | string     | Normalized tag, unique — the lookup key |
| `display`     | string     | Casing as first written, e.g. "Sunday"  |
| `firstUsedAt` | ISO string | Set once on insert                      |

## API Endpoints

### Auth

| Method | Endpoint         | Description        |
| ------ | ---------------- | ------------------ |
| POST   | `/auth/register` | Register as MEMBER |
| POST   | `/auth/login`    | Login, get JWT     |

### Users (PostgreSQL)

| Method | Endpoint     | Description                |
| ------ | ------------ | -------------------------- |
| GET    | `/users`     | List all users (paginated) |
| GET    | `/users/:id` | Get user by ID             |
| POST   | `/users`     | Admin: create user         |
| PATCH  | `/users/:id` | Admin: update user         |
| DELETE | `/users/:id` | Admin: delete user         |

### Abidings (MongoDB)

| Method | Endpoint              | Description                          |
| ------ | --------------------- | ------------------------------------ |
| GET    | `/abidings`           | All abidings (latest first)          |
| GET    | `/abidings?userId=X`  | Filter by user                       |
| GET    | `/abidings?hashtag=X` | Filter by hashtag (case-insensitive) |
| POST   | `/abidings`           | Create abiding (auth required)       |
| PATCH  | `/abidings/:id`       | Reply to an abiding                  |
| DELETE | `/abidings/:id`       | Delete your own abiding              |

### Hashtags (MongoDB)

| Method | Endpoint          | Description                           |
| ------ | ----------------- | ------------------------------------- |
| GET    | `/hashtags`       | Every tag ever used (dropdown source) |
| GET    | `/hashtags/:slug` | One tag, or 404                       |

## Roles

| Role   | Description                                             |
| ------ | ------------------------------------------------------- |
| ADMIN  | Seeded on first boot. Manages users.                    |
| PRIEST | Can send abidings (wisdom). Future: officiate weddings. |
| MEMBER | Can post thoughts, reply to anything.                   |

## MVP Scope

- [x] PostgreSQL + MongoDB via Docker Compose
- [x] User CRUD with roles (ADMIN seeded)
- [x] JWT auth (register/login)
- [x] Abidings CRUD with reply chains
- [x] ISO string timestamps on all entities
- [ ] Priests-only endpoints (future)
- [ ] Abide University integration (future)
