import { Module } from "@nestjs/common";

import { PaginationProvider } from "./pagination.provider.js";

// A module with a list route imports this, then injects PaginationProvider
// into its service and its controller. Without the export, the provider
// would be private to this module.
@Module({
  providers: [PaginationProvider],
  exports: [PaginationProvider],
})
export class PaginationModule {}
