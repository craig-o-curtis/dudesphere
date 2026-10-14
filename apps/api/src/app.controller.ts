import { Public } from "@nestjs/authentication";
import { Controller, Get } from "@nestjs/common";

import { AppService } from "./app.service.js";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // The health check. Public so a probe needs no credentials.
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
