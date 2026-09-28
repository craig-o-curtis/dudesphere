import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { getUtcNow } from "@northguild/gmt";
import { Repository } from "typeorm";

import { User } from "../users/user.entity.js";
import { Profile } from "./profile.entity.js";

@Injectable()
export class ProfilesSeedService implements OnModuleInit {
  private readonly logger = new Logger(ProfilesSeedService.name);

  constructor(
    @InjectRepository(Profile)
    private readonly profilesRepository: Repository<Profile>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seed();
  }

  async seed(): Promise<void> {
    const adminEmail = this.configService.get<string>("EMAIL");

    if (!adminEmail) {
      this.logger.warn("EMAIL not set — skipping profile seed");
      return;
    }

    // Find the admin user
    const adminUser = await this.usersRepository.findOne({
      where: { email: adminEmail },
    });

    if (!adminUser) {
      this.logger.warn(`Admin user (${adminEmail}) not found — skipping profile seed`);
      return;
    }

    const nowUtc = getUtcNow();

    let profile = await this.profilesRepository.findOne({
      where: { userId: adminUser.id },
    });

    if (profile) {
      // Update existing profile
      profile.firstName = "Admin";
      profile.lastName = "Dude";
      profile.bio = "bio breaking";
      profile.isDude = true;
      profile.updatedAt = nowUtc;
      await this.profilesRepository.save(profile);
      this.logger.log(`Updated admin profile for user ${adminEmail}`);
    } else {
      // Create new admin profile
      profile = this.profilesRepository.create({
        userId: adminUser.id,
        firstName: "Admin",
        lastName: "Dude",
        bio: "bio breaking",
        isDude: true,
        createdAt: nowUtc,
        updatedAt: nowUtc,
      });

      await this.profilesRepository.save(profile);
      this.logger.log(`Seeded admin profile for user ${adminEmail}`);
    }
  }
}
