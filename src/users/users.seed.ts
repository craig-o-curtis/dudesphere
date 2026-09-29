import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { getUtcNow } from "@northguild/gmt";
import { Repository } from "typeorm";

import { User, UserRole } from "./user.entity.js";

@Injectable()
export class UsersSeedService {
  private readonly logger = new Logger(UsersSeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async seed(adminEmail: string, adminPassword: string): Promise<void> {
    if (!adminEmail || !adminPassword) {
      this.logger.warn("EMAIL or PASSWORD not set — skipping admin seed");
      return;
    }

    let admin = await this.usersRepository.findOne({
      where: { email: adminEmail },
    });

    if (admin) {
      // Update existing user to ensure correct role/flags
      admin.username = "Admin";
      admin.password = adminPassword;
      admin.role = UserRole.ADMIN;
      await this.usersRepository.save(admin);
      this.logger.log(`Updated admin user (${adminEmail}) with role ${UserRole.ADMIN}`);
    } else {
      // Create new admin
      const nowUtc = getUtcNow();
      admin = this.usersRepository.create({
        username: "Admin",
        email: adminEmail,
        password: adminPassword,
        role: UserRole.ADMIN,
        createdAt: nowUtc,
        updatedAt: nowUtc,
      });

      await this.usersRepository.save(admin);
      this.logger.log(`Seeded admin user (${adminEmail}) with role ${UserRole.ADMIN}`);
    }
  }
}