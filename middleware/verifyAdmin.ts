import { PrismaClient } from "@prisma/client";
import { Request, Response, NextFunction } from "express";

const prisma = new PrismaClient();

export const verifyAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ message: "Email is required" });
    return;
  }

  // Check if the user exists and has ADMIN role 
  const adminUser = await prisma.users.findUnique({ where: { email } });
  if (!adminUser || adminUser.activeProfile !== "ADMIN") {
    res.status(403).json({ message: "Access denied" });
    return;
  }

  next();
};  