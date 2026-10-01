import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { getUtcNow } from "@northguild/gmt";
import { Model } from "mongoose";

import { Abiding } from "../../abiding/abiding.schema.js";

// Plain type for seed data (without Mongoose Document methods)
type AbidingSeedData = {
  userId: number;
  message: string;
  replyToId: string | null;
  username: string | null;
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

  async seed(nodeEnv: string, adminEmail: string): Promise<void> {
    if (nodeEnv !== "development") {
      this.logger.log("Skipping Abiding seed — not in development environment");
      return;
    }

    const count = await this.abidingModel.countDocuments();

    if (count > 0) {
      this.logger.log(`Abiding collection already has ${count} documents — skipping seed`);
      return;
    }

    if (!adminEmail) {
      this.logger.warn("EMAIL not set — skipping Abiding seed");
      return;
    }

    const now = getUtcNow();
    const sampleAbidings: AbidingSeedData[] = [
      {
        userId: 1,
        message:
          "Welcome to Dudesphere! This is your first abiding. Share your thoughts with the community.",
        username: "Admin",
        replyToId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: 1,
        message: "Abidings are like micro-posts. Keep them short, sweet, and authentic.",
        username: "Admin",
        replyToId: null,
        createdAt: now,
        updatedAt: now,
      },
    ];

    await this.abidingModel.insertMany(sampleAbidings);
    this.logger.log(`Seeded ${sampleAbidings.length} sample abidings`);
  }
}
