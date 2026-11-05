export function isStrongPassword(password: string) {
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) return false;
  if (!/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return false;
  return !/(?:012|123|234|345|456|567|678|789|890|987|876|765|654|543|432|321|210)/.test(password);
}

export const strongPasswordMessage =
  "Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character; sequential numbers such as 123 or 321 are not allowed.";
