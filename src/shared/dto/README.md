# NestJS DTOs

## TLDR description

A DTO (data transfer object) is a class that describes the shape of data going
into or out of a route. The global `ValidationPipe` checks incoming data against
the `class-validator` decorators on the class. Data that does not fit gets a 400.

A DTO used by one feature lives in that feature, such as `src/users/dto`.
This folder holds the ones several features share.

## In this folder

- `id-param.dto.ts` holds `IdParamDto`, the `:id` in the URL for routes backed
  by a Postgres row (`user`, `profile`). It accepts digits only, from 1 to
  2,147,483,647, the largest Postgres `integer`. Anything else is a 400.
- `id-param.http.spec.ts` tests it over HTTP.
- `pagination-query.dto.ts` holds `PaginationQueryDto`, the `?limit=&page=`
  query on every list route: `GET /users`, `GET /profiles`, `GET /abidings`,
  `GET /abidings/me` and `GET /hashtags`. `limit` is 1 to 100, default 10.
  `page` is 1 to 1,000,000, default 1. Both accept digits only, so `0x10`,
  `1e1` and `+5` are a 400. Page 0 used to reach Postgres as a negative OFFSET
  and come back as a 500. So did a page too large for an OFFSET.
- `pagination-query.dto.spec.ts` tests the defaults and bounds directly, and
  `pagination-query.http.spec.ts` tests them over HTTP.
- `paginated-response.ts` holds the body every list route answers with, and
  `toPaginatedResponse`, the function that builds it. It also holds
  `PageRequest` and `Page`, the two types a service uses for a list, and
  `toSkip`, which turns a page into an OFFSET.
- `paginated-response.spec.ts` tests the function directly.
  `paginated-response.http.spec.ts` proves over HTTP that the serializer still
  hides `password` on the items inside `data`.

## How to use it

```ts
@Get(":id")
getUserById(@Param() { id }: IdParamDto) {}
```

Mongo-backed routes do not use it. Their ids go through `ParseObjectIdPipe`,
or the route is keyed by a slug.

## How to paginate a list

Nest has no pagination of its own. A list route here has three parts.

**The controller** takes the query and wraps what the service returns:

```ts
// src/profiles/profiles.controller.ts
@Get()
async getProfiles(
  @Query() query: PaginationQueryDto,
): Promise<PaginatedResponse<ProfileResponseDto>> {
  const profiles = await this.profilesService.getProfiles(query);
  return toPaginatedResponse(profiles, query, "/profiles");
}
```

**The service** runs its own query and returns one page and the total. It
always sorts. Without a fixed order a database may return rows in any order,
and two pages of one list can repeat a row or skip one.

```ts
// src/profiles/profiles.service.ts
async getProfiles(request: PageRequest): Promise<Page<ProfileResponseDto>> {
  const [profiles, total] = await this.profileRepository.findAndCount({
    order: { id: "ASC" },
    skip: toSkip(request),
    take: request.limit,
  });
  return { items: profiles.map((profile) => ProfileResponseDto.fromEntity(profile)), total };
}
```

A Mongo list does the same with `find(filter).sort().skip().limit()` and
`countDocuments(filter)`. See `findPage` in `src/abidings/abidings.service.ts`.

**The response** has the same shape on every list route:

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
  `GET /abidings`. Pass them as the fourth argument to `toPaginatedResponse`.
- Each item in `data` must be an instance of its response DTO, not a plain
  copy. The serializer finds `@Exclude` by looking at the item's class.

A route with filters of its own extends the query class and does not redeclare
`limit` or `page`: see `src/abidings/dto/list-abidings-query.dto.ts`.
