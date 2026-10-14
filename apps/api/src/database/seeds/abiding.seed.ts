import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { getUtcNow } from "@northguild/gmt";
import { Model } from "mongoose";

import { Abiding } from "../../abidings/abiding.schema.js";

// Plain type for seed data (without Mongoose Document methods)
type AbidingSeedData = {
  userId: number;
  message: string;
  replyToId: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class AbidingSeedService {
  private readonly logger = new Logger(AbidingSeedService.name);

  constructor(
    @InjectModel(Abiding.name)
    private readonly abidingModel: Model<Abiding>,
  ) {}

  // adminUserId is the id UsersSeedService gave the admin, or null when it
  // seeded none. The sample abidings are written as that user. The id used to
  // be a fixed 1, which is only the admin's id in a database that has never
  // held another user.
  async seed(nodeEnv: string, adminUserId: number | null): Promise<void> {
    if (nodeEnv !== "development") {
      this.logger.log("Skipping Abiding seed — not in development environment");
      return;
    }

    const count = await this.abidingModel.countDocuments();

    if (count > 0) {
      this.logger.log(`Abiding collection already has ${count} documents — skipping seed`);
      return;
    }

    if (adminUserId === null) {
      this.logger.warn("No admin user was seeded — skipping Abiding seed");
      return;
    }

    const now = getUtcNow();
    const sampleAbidings: AbidingSeedData[] = [
      {
        userId: adminUserId,
        message:
          "Welcome to Dudesphere! This is your first abiding. Share your thoughts with the community.",
        replyToId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: adminUserId,
        message: "Abidings are like micro-posts. Keep them short, sweet, and authentic.",
        replyToId: null,
        createdAt: now,
        updatedAt: now,
      },
    ];

    await this.abidingModel.insertMany(sampleAbidings);
    this.logger.log(`Seeded ${sampleAbidings.length} sample abidings`);
  }
}
