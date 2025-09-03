import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthenticatedRequest } from "@/middleware/verifyUsers";

const prisma = new PrismaClient();
export const savePaymentMethod = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { paymentMethodId, customerId } = req.body
        const userId = req?.user?.id || 'cmf3g8us50000vc1cv4wajg2s';

        await prisma.paymentMethod.create({
            data: {
                stripePaymentMethodId: paymentMethodId,
                userId,
                customerID: customerId
            }
        })

        return res.status(201).json({
            message: 'Payment Method Saved.'
        })
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong.' })
    }
}
