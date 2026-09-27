import { Injectable } from "@nestjs/common";

@Injectable()
export class AuthStateService {
  public isAuthenticated: boolean = false;
}
