import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface AuthRequest extends Request {
  user?: JwtPayload & { id: string };
}

export const requireRole =
  (allowedRoles: string[]) =>
    async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authHeader = req.headers["authorization"];

        if (!authHeader) {
          res.status(401).json({ message: "Authorization header missing" });
          return;
        }

        const token = authHeader.startsWith("Bearer ")
          ? authHeader.split(" ")[1]
          : authHeader;

        if (!process.env.JWT_SECRET) {
          throw new Error("JWT_SECRET is not defined in environment variables");
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload & {
          id: string;
        };

        const user = await prisma.users.findUnique({
          where: { id: decoded.id },
          select: { activeProfile: true },
        });

        if (!user) {
          res.status(404).json({ message: "User not found" });
          return;
        }

        if (!allowedRoles.includes(user.activeProfile)) {
          res.status(403).json({ message: "Permission denied" });
          return;
        }

        req.user = decoded;
        next();
      } catch (err) {
        console.error("requireRole middleware error:", err);
        res.status(401).json({ message: "Invalid or expired token" });
      }
    };
