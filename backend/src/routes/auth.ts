import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { Role } from "@prisma/client";
import { verifyToken } from "../middleware/auth.middleware";

export const authRouter = Router();

const SALT_ROUNDS = 12;
const JWT_EXPIRES_IN = "7d";

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
authRouter.post("/signup", async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, role } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: Role;
  };

  // Validate required fields
  if (!name?.trim() || !email?.trim() || !password) {
    res.status(400).json({
      success: false,
      message: "name, email, and password are required.",
    });
    return;
  }

  // Validate password strength
  if (password.length < 8) {
    res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters.",
    });
    return;
  }

  // Validate role if provided
  const assignedRole: Role =
    role && Object.values(Role).includes(role) && role !== Role.ADMIN
      ? role
      : Role.CUSTOMER;

  // Check for existing user
  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existing) {
    res.status(409).json({ success: false, message: "Email already in use." });
    return;
  }

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: email.toLowerCase(),
      password: hashed,
      role: assignedRole,
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: JWT_EXPIRES_IN }
  );

  res.status(201).json({ success: true, token, user });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
authRouter.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email?.trim() || !password) {
    res.status(400).json({
      success: false,
      message: "email and password are required.",
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  // Constant-time comparison to prevent timing attacks
  const dummyHash =
    "$2b$12$invalidhashfortimingprotectionXXXXXXXXXXXXXXXXXXXXXX";
  const isValid = await bcrypt.compare(
    password,
    user?.password ?? dummyHash
  );

  if (!user || !isValid) {
    res
      .status(401)
      .json({ success: false, message: "Invalid email or password." });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: JWT_EXPIRES_IN }
  );

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
authRouter.get("/me", verifyToken, async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  if (!user) {
    res.status(404).json({ success: false, message: "User not found." });
    return;
  }

  res.json({ success: true, user });
});