import { AuthenticatedRequest } from "@/middleware/verifyUsers";
import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import { profileSchema } from "@/utils/validations";

const prisma = new PrismaClient();

export const myProfile = async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.user?.id || !req.user?.activeProfile) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized.",
            });
        }

        // Dynamically select profile based on activeProfile
        const includeProfile =
            req.user.activeProfile === "STUDENT"
                ? { studentProfile: true }
                : { expertProfile: true };

        const user = await prisma.users.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                linkedin_id: true,
                name: true,
                email: true,
                lastLogin: true,
                image: true,
                activeProfile: true,
                timezone: true,
                createdAt: true,
                updatedAt: true,
                ...includeProfile,
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        // Shape response data
        const { studentProfile, expertProfile, ...baseData } = user;
        const data = {
            ...baseData,
            meta: req.user.activeProfile === "STUDENT" ? studentProfile : expertProfile,
        };

        return res.status(200).json({
            success: true,
            message: "Authenticated.",
            data,
        });
    } catch (error) {
        console.error("Error fetching authenticated profile:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get authenticated profile.",
            error: error instanceof Error ? error.message : "Internal server error",
        });
    }
};


type Payload = {
    [key: string]: string | number | string[] | boolean | null;
};

const userUpdatableFields = ["name", "image", "timezone"];

async function updateStudentProfile(id: string, payload: Payload) {
    return await prisma.studentProfile.upsert({
        where: { userId: id },
        update: payload,
        create: { userId: id, ...payload },
    });
}

async function updateExpertProfile(id: string, payload: Payload) {
    return await prisma.expertProfile.upsert({
        where: { userId: id },
        update: payload,
        create: { userId: id, ...payload },
    });
}

export const updateProfile = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req?.user;
        const role = user?.activeProfile;
        const id = user?.id;
        const { data, error, success } = profileSchema.safeParse(req.body);

        if (!success) {
            return res.status(400).json({
                success: false,
                errors: JSON.parse(error.message).map(err => ({
                    field: err.path.join("."),
                    message: err.message,
                })),
            });
        }

        const currentUser = await prisma.users.findUnique({
            where: { id },
        });

        if (!currentUser) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const userData: Payload = {};
        const profileData: Payload = {};

        for (const [key, value] of Object.entries(data)) {
            if (userUpdatableFields.includes(key)) {
                userData[key] = value;
            } else {
                profileData[key] = value;
            }
        }

        if (Object.keys(userData).length > 0) {
            await prisma.users.update({
                where: { id },
                data: userData,
            });
        }

        let updatedProfile;
        if (role === "STUDENT") {
            updatedProfile = await updateStudentProfile(id, profileData);
        } else if (role === "EXPERT") {
            updatedProfile = await updateExpertProfile(id, profileData);
        } else {
            return res.status(400).json({
                success: false,
                message: "Invalid profile type",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully.",
            data: updatedProfile,
        });
    } catch (error) {
        console.error(`got error while updating the profile: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: "Something went wrong while updating the profile",
        });
    }
};
