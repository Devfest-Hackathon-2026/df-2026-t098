export function validUsername(value: string): boolean {
  const username = value.trim();
  const length = [...username].length;
  return length >= 3 && length <= 32 && /^[\p{L}\p{N}._-]+$/u.test(username);
}

export function validSignupPassword(value: string): boolean {
  const length = [...value].length;
  return length >= 15 && length <= 128;
}
