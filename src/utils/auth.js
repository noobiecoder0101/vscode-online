import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export async function hashPassword(plainTextPassword) {
  return bcrypt.hash(plainTextPassword, 10);
}

export async function comparePassword(plainTextPassword, hash) {
  return bcrypt.compare(plainTextPassword, hash);
}

export function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
}

export function hasValidJwtSecret() {
  return typeof process.env.JWT_SECRET === "string" && process.env.JWT_SECRET.length >= 32;
}
