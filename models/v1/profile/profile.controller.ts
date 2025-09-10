import { AuthenticatedRequest } from "@/middleware/verifyUsers";
import { Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const myProfile = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = await prisma.users.findUnique({
            where: { id: req.user?.id },
            select: {
                id: true,
                linkedInId: true,
                name: true,
                email: true,
                password: false,
                lastLogin: true,
                image: true,
                activeProfile: true,
                timezone: true,
                createdAt: true,
                updatedAt: true
            }
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized.",
            });
        }

        res.status(200).json({
            success: true,
            message: 'Authenticated',
            data: user
        });
    } catch (error) {
        console.error("Error getting authenticated profile:", error);
        res.status(500).json({
            success: false,
            message: "Failed to get authenticated profile.",
            error: error instanceof Error ? error.message : "Internal server error",
        });
    }
}
