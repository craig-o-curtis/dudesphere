import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { PaginationModule } from "../shared/pagination/pagination.module.js";
import { Hashtag, HashtagSchema } from "./hashtag.schema.js";
import { HashtagsController } from "./hashtags.controller.js";
import { HashtagsService } from "./hashtags.service.js";

// Owns the Hashtag registry collection: the canonical list of every tag ever
// used, which GET /hashtags reads for a dropdown.
//
// Exports HashtagsService so AbidingsModule can call registerTags when it
// derives hashtags from an abiding's message. Nothing here imports
// AbidingsModule, so there is no cycle: abidings depend on hashtags, not the
// other way round.
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Hashtag.name, schema: HashtagSchema }]),
    PaginationModule,
  ],
  controllers: [HashtagsController],
  providers: [HashtagsService],
  exports: [HashtagsService],
})
export class HashtagsModule {}
