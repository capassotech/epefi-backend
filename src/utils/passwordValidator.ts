export const PASSWORD_POLICY_MESSAGE =
  "La contraseña debe tener al menos 8 caracteres, una mayúscula, un número y un carácter especial";

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;
const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

const getRuleFailures = (password: string): string[] => {
  const failures: string[] = [];
  if (password.length < MIN_LENGTH) failures.push("min-length");
  if (!/[A-Z]/.test(password)) failures.push("uppercase");
  if (!/\d/.test(password)) failures.push("number");
  if (!SPECIAL_CHAR_REGEX.test(password)) failures.push("special");
  return failures;
};

export const isValidPassword = (password: string | null | undefined): boolean => {
  if (typeof password !== "string" || password.length === 0) return false;
  if (password.length > MAX_LENGTH) return false;
  return getRuleFailures(password).length === 0;
};

export const getPasswordValidationErrors = (
  password: string | null | undefined,
  options?: { required?: boolean }
): string[] => {
  const required = options?.required !== false;

  if (password === undefined || password === null || password === "") {
    return required ? ["La contraseña es obligatoria"] : [];
  }

  if (typeof password !== "string") {
    return [PASSWORD_POLICY_MESSAGE];
  }

  if (password.length > MAX_LENGTH) {
    return ["La contraseña no puede exceder 128 caracteres"];
  }

  if (!isValidPassword(password)) {
    return [PASSWORD_POLICY_MESSAGE];
  }

  return [];
};

export const getPasswordRuleFailures = (
  password: string | null | undefined
): string[] => {
  if (typeof password !== "string" || password.length === 0) return ["required"];
  if (password.length > MAX_LENGTH) return ["max-length"];
  return getRuleFailures(password);
};
