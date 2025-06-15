import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export const verifyUser = (...allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
      res.status(401).json({ message: "No token provided" });
      return;
    }

    try {
      const token = authHeader;
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
      req.user = decoded;
      console.log(req.user )
      if (
        allowedRoles.length &&
        !allowedRoles.includes("ANY") &&
        !allowedRoles.includes(req.user?.activeProfile)
      ) {
        res
          .status(403)
          .json({ message: "Access denied. Insufficient permission." });
        return;
      }

      next();
    } catch (error) {
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }
  };
};