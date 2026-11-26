import { User } from "./User.js";

export class Admin extends User {
  constructor(profile) {
    super(profile);
  }

  canManageQueues() { return true; }
}
