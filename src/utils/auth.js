import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// JWT_SECRET must be defined in both .env and .env.example.

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
  return jwt.verify(token, process.env.JWT_SECRET);
}
