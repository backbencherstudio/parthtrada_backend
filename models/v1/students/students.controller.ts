import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";


const prisma = new PrismaClient()

export const getStudentByID = async (req: Request, res: Response) => {
    try {
        const id = req.params.id

        const student = await prisma.studentProfile.findUnique({
            where: {
                userId: id
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                    },
                },
            },
        })

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found.'
            })
        }

        res.status(200).json({
            success: true,
            message: "Student fetched successfully",
            data: student
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to get student.",
            error: "Internal server error",
        });
    }
}
