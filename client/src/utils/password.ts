export const passwordRequirements = [
  "At least 8 characters",
  "One uppercase letter",
  "One lowercase letter",
  "One number",
  "One special character",
  "No sequential numbers such as 123 or 321",
] as const;

export function passwordChecks(password: string) {
  const hasSequentialNumbers = /(?:012|123|234|345|456|567|678|789|890|987|876|765|654|543|432|321|210)/.test(password);
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    noSequentialNumbers: !hasSequentialNumbers,
  };
}

export function isStrongPassword(password: string) {
  return Object.values(passwordChecks(password)).every(Boolean);
}

export function passwordError(password: string) {
  const checks = passwordChecks(password);
  if (!checks.length) return "Password must be at least 8 characters.";
  if (!checks.uppercase) return "Password must include an uppercase letter.";
  if (!checks.lowercase) return "Password must include a lowercase letter.";
  if (!checks.number) return "Password must include a number.";
  if (!checks.special) return "Password must include a special character.";
  if (!checks.noSequentialNumbers) return "Password cannot contain sequential numbers such as 123 or 321.";
  return "";
}
