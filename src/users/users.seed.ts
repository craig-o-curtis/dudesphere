import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { getUtcNow } from "@northguild/gmt";
import { Repository } from "typeorm";

import { HashingProvider } from "../hashing/hashing.provider.js";
import { User, UserRole } from "./user.entity.js";

@Injectable()
export class UsersSeedService {
  private readonly logger = new Logger(UsersSeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    // @Inject names the token outright. `pnpm seed:run` runs through tsx, which
    // does not emit the constructor types Nest otherwise reads, so without it
    // this parameter arrives undefined there.
    @Inject(HashingProvider)
    private readonly hashingProvider: HashingProvider,
  ) {}

  // Returns the admin's id, so the seeds that follow can write rows as that
  // user. Null when there was nothing to seed.
  async seed(adminEmail: string, adminPassword: string): Promise<number | null> {
    if (!adminEmail || !adminPassword) {
      this.logger.warn("EMAIL or PASSWORD not set — skipping admin seed");
      return null;
    }

    // The seed writes to the table directly, so it hashes for itself. Every
    // run stores a fresh hash of PASSWORD, which resets the admin's password
    // to the value in .env.
    const passwordHash = await this.hashingProvider.hash(adminPassword);

    let admin = await this.usersRepository.findOne({
      where: { email: adminEmail },
    });

    if (admin) {
      // Update existing user to ensure correct role/flags
      admin.username = "Admin";
      admin.password = passwordHash;
      admin.role = UserRole.ADMIN;
      admin = await this.usersRepository.save(admin);
      this.logger.log(`Updated admin user (${adminEmail}) with role ${UserRole.ADMIN}`);
    } else {
      // Create new admin
      const nowUtc = getUtcNow();
      admin = this.usersRepository.create({
        username: "Admin",
        email: adminEmail,
        password: passwordHash,
        role: UserRole.ADMIN,
        createdAt: nowUtc,
        updatedAt: nowUtc,
      });

      admin = await this.usersRepository.save(admin);
      this.logger.log(`Seeded admin user (${adminEmail}) with role ${UserRole.ADMIN}`);
    }

    return admin.id;
  }
}
