import { Controller, Get } from "@nestjs/common";

import { AppService } from "./app.service.js";
import { Public } from "./shared/decorators/public.decorator.js";

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
