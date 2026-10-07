// The metadata keys the auth decorators write and the guards read. They live
// here, in one file, so a decorator and the guard that reads it cannot drift
// apart: a typo in one place would silently make a route public, or make a
// role rule never fire.
export const IS_PUBLIC_KEY = "isPublic";
export const ROLES_KEY = "roles";
