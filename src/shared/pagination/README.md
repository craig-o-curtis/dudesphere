# NestJS Pagination

## TLDR description

Nest has no pagination of its own. This folder is this app's: one provider
that every list route uses, the module that shares it, the query DTO for
`?limit=&page=`, and the shape of the response.

A list route never returns a bare array. It returns one page of rows, the
count of all of them, and links to the other pages.

## In this folder

- `pagination.provider.ts` holds `PaginationProvider`. It has three methods:
  - `paginatePgQuery` reads one page from Postgres, through a TypeORM repository.
  - `paginateMongoModel` reads one page from Mongo, through a Mongoose model.
  - `toResponse` turns a page into the body the route answers with.
- `pagination.module.ts` holds `PaginationModule`, which exports the provider.
- `paginated.interface.ts` holds three types: `Paginated`, the body of every
  list route; `Page`, what a service returns for a list; and `PageRequest`,
  the `limit` and `page` a caller asked for.
- `dto/pagination-query.dto.ts` holds `PaginationQueryDto`, the `?limit=&page=`
  query on every list route: `GET /users`, `GET /profiles`, `GET /abidings`,
  `GET /abidings/me` and `GET /hashtags`. `limit` is 1 to 100, default 10.
  `page` is 1 to 1,000,000, default 1. Both accept digits only, so `0x10`,
  `1e1` and `+5` are a 400. Page 0 used to reach Postgres as a negative OFFSET
  and come back as a 500. So did a page too large for an OFFSET.
- `pagination.provider.spec.ts` tests the three methods directly.
- `pagination.http.spec.ts` proves over HTTP that the serializer still hides
  `password` on the items inside `data`.
- `dto/pagination-query.dto.spec.ts` tests the defaults and bounds directly,
  and `dto/pagination-query.http.spec.ts` tests them over HTTP.

## How to paginate a list

A list route has three parts.

**The module** imports `PaginationModule`, so its service and its controller
can inject the provider:

```ts
// src/profiles/profiles.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([Profile, User]), PaginationModule],
  // ...
})
export class ProfilesModule {}
```

**The service** hands the provider its repository and gets back one page of
rows and the total. It maps the rows to its response DTO itself.

```ts
// src/profiles/profiles.service.ts
async getProfiles(pageRequest: PageRequest): Promise<Page<ProfileResponseDto>> {
  const { items, total } = await this.paginationProvider.paginatePgQuery(
    pageRequest,
    this.profileRepository,
    { order: { id: "ASC" } },
  );
  return { items: items.map((profile) => ProfileResponseDto.fromEntity(profile)), total };
}
```

The third argument takes any TypeORM find option, such as `where` or
`relations`. `order` is required. Without a fixed order a database may return
rows in any order, and two pages of one list can repeat a row or skip one.

A Mongo list calls `paginateMongoModel` with its model, a filter and a sort:

```ts
// src/hashtags/hashtags.service.ts
const { items, total } = await this.paginationProvider.paginateMongoModel(
  pageRequest,
  this.hashtagModel,
  { deletedAt: null },
  { slug: 1 },
);
```

**The controller** takes the query and asks the provider to wrap what the
service returned. It passes its own route path, which the links are built from:

```ts
// src/profiles/profiles.controller.ts
@Get()
async getProfiles(
  @Query() query: PaginationQueryDto,
): Promise<Paginated<ProfileResponseDto>> {
  const profiles = await this.profilesService.getProfiles(query);
  return this.paginationProvider.toResponse(profiles, query, "/profiles");
}
```

## The response

It has the same shape on every list route:

```json
{
  "data": [],
  "meta": { "itemsPerPage": 10, "totalItems": 1000, "currentPage": 3, "totalPages": 100 },
  "links": {
    "first": "/profiles?limit=10&page=1",
    "last": "/profiles?limit=10&page=100",
    "current": "/profiles?limit=10&page=3",
    "next": "/profiles?limit=10&page=4",
    "previous": "/profiles?limit=10&page=2"
  }
}
```

- `next` is `null` on the last page and `previous` is `null` on page 1.
- A page past the end is a 200 with an empty `data`, not a 404.
- Links are relative paths. A full URL would have to trust the `Host` header,
  which the caller controls.
- Links keep the route's other filters, such as `userId` and `hashtag` on
  `GET /abidings`. Pass them as the fourth argument to `toResponse`.
- Each item in `data` must be an instance of its response DTO, not a plain
  copy. The serializer finds `@Exclude` by looking at the item's class.

A route with filters of its own joins the query class to its own DTO with
`IntersectionType` and does not redeclare `limit` or `page`: see
`src/abidings/dto/get-abidings.dto.ts`.

## Why the provider does not read the request

A common version of this provider injects `REQUEST` and builds the links from
the request's URL. This one does not, for two reasons:

- A provider that injects `REQUEST` is created again for every request, and
  so is every class that depends on it. Here that would be all four list
  services, their controllers and `AuthService`. The seeds run outside a
  request and could not use those services at all.
- Building a full URL means trusting the `Host` header.

So the controller passes its path, and the provider stays a normal singleton.
