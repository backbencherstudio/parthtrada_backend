import AIRequest from "@/services/aiService";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { Request, Response } from 'express'

const prisma = new PrismaClient()

export const handleWebhook = async (req: Request, res: Response) => {
    const { event, payload } = req.body;

    if (event === "endpoint.url_validation") {
        const plainToken = payload.plainToken;
        const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN!;

        const hashForValidate = crypto
            .createHmac("sha256", secretToken)
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

    if (event === 'meeting.summary_completed') {
        const meeting_id = payload.object.meeting_id;
        const summary_content = payload.object.summary_content;
        const prompt = `Rewrite the following meeting summary into a single, concise English paragraph.
Remove all markdown, titles, and formatting.
Keep only the key information in natural professional English.
Do not add or invent any new details.

Input:
${summary_content}

Output:
A clean one-paragraph English meeting summary.
`;

        try {
            const summery = await AIRequest(prompt);

            await prisma.booking.update({
                where: {
                    meetingID: meeting_id
                },
                data: {
                    meeting_summery: summery
                }
            })
            console.log('meeting summery added to db.');

        } catch (error) {
            console.log('===============get error from generate meeting summery=====================');
            console.log(error?.message);
            console.log('====================================');
        }
    }

    res.status(200).json({ received: true });
}
