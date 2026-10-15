// Limits and patterns for the sign-in and sign-up forms, written once.
//
// Limits copied from CreateUserDto (apps/api/src/users/dto/create-user.dto.ts)
// and CreateProfileDto (apps/api/src/profiles/dto/create-profile-dto.ts). They
// are native attributes so the browser stops a bad value before it posts. That
// matters with JavaScript off, where an error answer is a blank page. Nest
// counts code points (@MaxCodePoints) and `maxlength` counts UTF-16 units, so
// an emoji may stop the browser a little early. Nest stays the judge.

/** The longest sign-in identifier (SignInDto, apps/api/src/auth/auth.dto.ts). */
export const IDENTIFIER_MAX_LENGTH = 100;

export const EMAIL_MAX_LENGTH = 100; // create-user.dto.ts:36
export const DISPLAY_NAME_MIN_LENGTH = 2; // create-profile-dto.ts:29
export const DISPLAY_NAME_MAX_LENGTH = 50; // create-profile-dto.ts:30
export const USERNAME_MIN_LENGTH = 3; // create-user.dto.ts:20
export const USERNAME_MAX_LENGTH = 24; // create-user.dto.ts:24
export const USERNAME_PATTERN = "[^\\s@]+"; // create-user.dto.ts:30
export const PASSWORD_MIN_LENGTH = 12; // create-user.dto.ts:44
export const PASSWORD_MAX_LENGTH = 128; // create-user.dto.ts:48

// `minlength` counts UTF-16 units, so six emoji pass it. `pattern` is compiled
// with the v flag, so "." counts code points like Nest does. The email pattern
// asks for a dot in the domain, which @IsEmail() also asks for. A padded
// display name and zero-width characters are left to Nest.
export const EMAIL_PATTERN = "[^@\\s]+@[^@\\s]+\\.[^@\\s.]{2,}";
export const EMAIL_TITLE = "Enter an email like name@example.com.";

// At least two characters that are not spaces, so "   " and " a " are refused.
export const DISPLAY_NAME_PATTERN = ".*\\S.*\\S.*";
export const PASSWORD_PATTERN = ".{12,128}";
