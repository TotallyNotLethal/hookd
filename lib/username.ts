export const USERNAME_PATTERN = /^[a-z0-9_]+$/i;
export const USERNAME_MIN_LENGTH = 3;

export function validateAndNormalizeUsername(username: string): string {
  if (typeof username !== "string") {
    throw new Error("Please enter a username.");
  }

  const trimmed = username.trim();

  if (trimmed.length < USERNAME_MIN_LENGTH) {
    throw new Error(`Usernames must be at least ${USERNAME_MIN_LENGTH} characters long.`);
  }

  if (!USERNAME_PATTERN.test(trimmed)) {
    throw new Error("Usernames can only include letters, numbers, and underscores.");
  }

  return trimmed.toLowerCase();
}
