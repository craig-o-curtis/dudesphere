import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { User } from "../users/user.entity.js";
import { Profile } from "./profile.entity.js";

@Injectable()
export class ProfilesSeedService {
  private readonly logger = new Logger(ProfilesSeedService.name);

  constructor(
    @InjectRepository(Profile)
    private readonly profilesRepository: Repository<Profile>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async seed(adminEmail: string): Promise<void> {
    if (!adminEmail) {
      this.logger.warn("EMAIL not set — skipping profile seed");
      return;
    }

    // relations: { profile: true } loads the admin's profile along with the user.
    // Without it, adminUser.profile is always undefined.
    const adminUser = await this.usersRepository.findOne({
      where: { email: adminEmail },
      relations: { profile: true },
    });

    if (!adminUser) {
      this.logger.warn(`Admin user (${adminEmail}) not found — skipping profile seed`);
      return;
    }

    const profile = adminUser.profile ?? this.profilesRepository.create({ userId: adminUser.id });
    const isNew = !adminUser.profile;

    // Set once, when the profile is created. A later run leaves the name
    // alone: the admin may have changed it, and writing it back could collide
    // with a member who has taken "Admin Dude" since.
    if (isNew) {
      profile.displayName = "Admin Dude";
    }
    profile.bio = "bio breaking";
    profile.isDude = true;
    await this.profilesRepository.save(profile);

    this.logger.log(`${isNew ? "Seeded" : "Updated"} admin profile for user ${adminEmail}`);
  }
}
