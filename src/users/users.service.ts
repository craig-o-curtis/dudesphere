import { Injectable } from "@nestjs/common";

@Injectable()
export class UsersService {
  // for now mock users in the constructor
  private users = [
    {
      id: 1,
      name: "John Doe",
    },
    {
      id: 2,
      name: "Jane Doe",
    },
  ];

  getUsers(limit?: number, page?: number): unknown {
    let users = this.users;

    if (limit && page) {
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      return users.slice(startIndex, endIndex);
    }

    return users;
  }

  getUser(id: number): unknown {
    return this.users.find((user) => user.id === id);
  }

  createUser(): number {
    // create a new user
    const newUser = {
      id: this.users.length + 1,
      name: "New User",
    };
    this.users.push(newUser);
    return newUser.id;
  }

  updateUser(id: number, user: { name: string }): string {
    // find user, update
    const userToUpdate = this.users.find((user) => user.id === id);
    if (userToUpdate) {
      userToUpdate.name = user.name;
    }

    return "User with id: " + id + " updated";
  }

  deleteUser(id: number): string {
    // find user, delete
    const userIndex = this.users.findIndex((user) => user.id === id);
    if (userIndex !== -1) {
      this.users.splice(userIndex, 1);
    }

    return "User with id: " + id + " deleted";
  }
}
