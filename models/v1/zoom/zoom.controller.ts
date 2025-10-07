import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { Request, Response } from 'express'

const prisma = new PrismaClient()

export const handleWebhook = async (req: Request, res: Response) => {
    const { event, payload } = req.body;

    if (event === "endpoint.url_validation") {
        const plainToken = payload.plainToken;
        const hashForValidate = crypto
            .createHmac("sha256", "bBxq-LdnQxmMo7jXBhLmtQ")
            .update(plainToken)
            .digest("hex");
        return res.status(200).json({
            plainToken,
            encryptedToken: hashForValidate,
        });
    }

    if (event === "meeting.ended") {
        const meetingId = payload.object.id;
        await prisma.booking.updateMany({
            where: { meetingID: meetingId },
            data: { status: "COMPLETED" },
        });
    }

    res.status(200).json({ received: true });
}
