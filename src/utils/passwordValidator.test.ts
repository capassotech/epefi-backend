import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidPassword } from "./passwordValidator";

describe("PasswordValidator", () => {
  it("rechaza contraseña corta", () => {
    assert.equal(isValidPassword("Ab1!xy"), false);
  });

  it("rechaza contraseña sin mayúscula", () => {
    assert.equal(isValidPassword("abcd123!"), false);
  });

  it("rechaza contraseña sin número", () => {
    assert.equal(isValidPassword("Abcdefg!"), false);
  });

  it("rechaza contraseña sin carácter especial", () => {
    assert.equal(isValidPassword("Abcdefg1"), false);
  });

  it("acepta contraseña válida", () => {
    assert.equal(isValidPassword("Abcdef1!"), true);
  });
});
