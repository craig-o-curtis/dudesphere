import { MigrationInterface, QueryRunner } from "typeorm";

// Changes every timestamp column from `timestamp` to `timestamptz`
// (timestamp with time zone).
//
// Why. A `timestamp` column holds a bare wall time, such as 11:21:09, with no
// zone. The pg driver has to guess the zone when it reads one, and it guesses
// the zone of the machine the app runs on. The database clock writes UTC, so
// on a machine three hours ahead of UTC every createdAt came back three hours
// early. A value the app wrote went the other way: it was stored as that
// machine's local time. A `timestamptz` column stores the instant itself, so
// the answer is the same on every machine.
//
// The data is converted in place. `AT TIME ZONE 'UTC'` reads each stored wall
// time as UTC, which is what the database clock wrote: createdAt, updatedAt
// and deletedAt on every row the app created.
//
// One kind of value does not convert exactly: a timestamp the app itself
// wrote while running outside UTC. That is "ordainedDate", and the createdAt
// and updatedAt of a seeded user. Those rows held the app machine's local
// wall time, so after this they are off by that machine's UTC offset. On a
// machine that runs in UTC, as CI and a server do, they were already right
// and stay right. No SQL can tell the two cases apart, because the old column
// did not record the zone. Reseed or re-enter such a value if it matters.
//
// down() goes back to `timestamp`, writing each instant as its UTC wall time.
export class TimestampsWithTimeZone1791542877415 implements MigrationInterface {
  name = "TimestampsWithTimeZone1791542877415";

  // EDITED BY HAND: the generated SQL dropped each column and added it again,
  // which loses every value in it. ALTER COLUMN ... TYPE ... USING converts
  // the values where they are and keeps the NOT NULL rule and the default.
  private static readonly columns: [table: string, column: string][] = [
    ["user", "createdAt"],
    ["user", "updatedAt"],
    ["user", "deletedAt"],
    ["profile", "ordainedDate"],
    ["profile", "createdAt"],
    ["profile", "updatedAt"],
    ["profile", "deletedAt"],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of TimestampsWithTimeZone1791542877415.columns) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE TIMESTAMP WITH TIME ZONE USING "${column}" AT TIME ZONE 'UTC'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of TimestampsWithTimeZone1791542877415.columns.toReversed()) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE TIMESTAMP USING "${column}" AT TIME ZONE 'UTC'`,
      );
    }
  }
}
