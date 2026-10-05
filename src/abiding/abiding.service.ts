import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

import { Abiding, AbidingDocument } from "./abiding.schema.js";
import { AbidingResponseDto } from "./dto/abiding-response.dto.js";
import { CreateAbidingDto } from "./dto/create-abiding.dto.js";
import { UpdateAbidingDto } from "./dto/update-abiding.dto.js";

@Injectable()
export class AbidingService {
  constructor(@InjectModel(Abiding.name) private readonly abidingModel: Model<AbidingDocument>) {}

  async getAbidings(userId?: number): Promise<AbidingResponseDto[]> {
    // deletedAt: null hides abidings of soft-deleted users
    const query: Record<string, any> = { deletedAt: null };
    if (userId) {
      query.userId = userId;
    }

    const abidings = await this.abidingModel.find(query).exec();
    return abidings.map((abiding) => this.toResponseDto(abiding));
  }

  async getAbidingById(id: string): Promise<AbidingResponseDto> {
    const abiding = await this.abidingModel.findOne({ _id: id, deletedAt: null }).exec();
    if (!abiding) {
      throw new Error("Abiding not found");
    }
    return this.toResponseDto(abiding);
  }

  async createAbiding(createAbidingDto: CreateAbidingDto): Promise<AbidingResponseDto> {
    const newAbiding = await this.abidingModel.create({
      userId: Number(createAbidingDto.userId),
      message: createAbidingDto.message,
      replyToId: createAbidingDto.replyToId || null,
    });

    return this.toResponseDto(newAbiding);
  }

  async patchAbiding(id: string, updateAbidingDto: UpdateAbidingDto): Promise<AbidingResponseDto> {
    const updatedAbiding = await this.abidingModel
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        Object.assign({}, updateAbidingDto, {
          replyToId: updateAbidingDto.replyToId || undefined,
        }),
        { new: true },
      )
      .exec();

    if (!updatedAbiding) {
      throw new Error("Abiding not found");
    }

    return this.toResponseDto(updatedAbiding);
  }

  async deleteAbiding(abidingId: string): Promise<void> {
    // deletedAt: null so an abiding hidden with its deleted user is a 404 here
    // too, and comes back intact if the user is restored.
    const result = await this.abidingModel
      .findOneAndDelete({ _id: abidingId, deletedAt: null })
      .exec();
    if (!result) {
      throw new Error("Abiding not found");
    }
  }

  // --- Private helpers ---

  private toResponseDto(abiding: AbidingDocument): AbidingResponseDto {
    return {
      id: abiding._id.toString(),
      userId: abiding.userId,
      message: abiding.message,
      username: abiding.username || undefined,
      createdAt: abiding.createdAt ?? "",
      updatedAt: abiding.updatedAt ?? "",
      replyToId: abiding.replyToId ?? undefined,
    };
  }
}
