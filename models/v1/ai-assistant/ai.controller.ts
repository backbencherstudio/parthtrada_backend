import { PrismaClient } from "@prisma/client";
import { parseStudentQuery, generateAIResponse } from "@/services/aiService";

const prisma = new PrismaClient();

export async function handleStudentQuery(req: any, res: any) {
    try {
        const { query, studentId, chatRoomId } = req.body;

        // 1. Parse intent
        const { intent, parameters } = await parseStudentQuery(query);

        console.log('==============intent parameters======================');
        console.log({ intent, parameters });
        console.log('====================================');

        let dbData: any = {};

        // 2. Perform DB query based on intent
        switch (intent) {
            case "Booking":
                const { skill, date } = parameters;
                const requestedDate = new Date(date);
                const weekday = requestedDate.toLocaleString("en-US", { weekday: "long" });

                const experts = await prisma.expertProfile.findMany({
                    where: {
                        skills: { has: skill },
                        availableDays: { has: weekday }
                    },
                    include: {
                        user: { select: { name: true, email: true } },
                        // chatRoomsAsExpert: true
                    }
                });

                // dbData = experts.filter(expert =>
                //     !expert.chatRoomsAsExpert.some(room =>
                //         room.createdAt.toISOString().slice(0, 10) === date
                //     )
                // );
                break;

            case "Reviews":
                const { expertId } = parameters;
                dbData = await prisma.review.findMany({
                    where: { expertId },
                    orderBy: { createdAt: "desc" },
                    take: 5
                });
                break;

            case "Payments":
                dbData = await prisma.transaction.findMany({
                    where: { userId: studentId },
                    orderBy: { createdAt: "desc" },
                    take: 5
                });
                break;

            case "FAQ":
                dbData = { answer: "You can book sessions, review experts, and check payments inside the app." };
                break;

            default:
                dbData = { answer: "I am not sure. Please rephrase your question." };
                break;
        }

        // 3. Generate AI response
        const aiResponse = await generateAIResponse(query, dbData);

        // 4. Log AI response in chat
        // if (chatRoomId) {
        //     await prisma.message.create({
        //         data: {
        //             content: aiResponse,
        //             senderType: "ADMIN",
        //             senderId: "AI",
        //             chatRoomId,
        //             isAI: true
        //         }
        //     });
        // }

        res.json({ response: aiResponse, dbData });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
}
