import { AuthenticatedRequest } from "@/middleware/verifyUsers";
import { reviewSchema } from "@/utils/validations";
import { PrismaClient } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { Response } from "express";

const prisma = new PrismaClient()

export const create = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = reviewSchema.safeParse(req.body);
        if (!body.success) {
            res.status(400).json({
                success: false,
                message: "Invalid query parameters",
                errors: body.error.flatten().fieldErrors,
            });
            return
        }

        const { data } = body

        const booking = await prisma.booking.findFirst({
            where: {
                id: data.bookingId
            },
            include: {
                review: {
                    select: {
                        id: true
                    }
                }
            }
        })

        if (booking.status === 'COMPLETED' && !booking?.review?.id) {
            const review = await prisma.review.create({
                data: {
                    rating: data.rating,
                    bookingId: data.bookingId,
                    expertId: booking.expertId,
                    studentId: booking.studentId,
                    description: data.description,
                }
            })
            res.status(201).json({
                success: true,
                data: review,
                message: 'Review created successfully.'
            })
            return
        } else {
            res.status(400).json({
                success: false,
                message: 'Error creating review',
            })
            return
        }

    } catch (error) {
        if (
            error instanceof PrismaClientKnownRequestError &&
            error.code === 'P2002'
        ) {
            return res.status(409).json({
                success: false,
                message: "A review for this booking already exists.",
                error: "Unique constraint violation on bookingId",
            });
        }
        console.error('Error creating reviews:', error?.message)
        res.status(500).json({
            success: false,
            message: "Failed to create review.",
            error: error instanceof Error ? error.message : "Internal server error",
        });
        return
    }
}