import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const onlyAdmin = async(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    res.status(401).json({ message: "No token provided" });
    return;
  }

  // Remove 'Bearer ' prefix if present
  const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;

  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET as string);
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });


    if (user?.activeProfile !== "ADMIN") {
      res.status(403).json({ message: "Admin access required" });
      return;
    }

    (req as any).user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};