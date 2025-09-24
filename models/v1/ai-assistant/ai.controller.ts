import { PrismaClient, Role } from "@prisma/client";
import { parseStudentQuery, generateAIResponse } from "@/services/aiService";

const prisma = new PrismaClient();

/**
 * Handle student chat query
 */
export async function handleStudentQuery(req: any, res: any) {
    try {
        const query = req.body?.query;
        const studentId = req.body?.studentId
        const expertId = req.body?.expertId

        if (!query || !studentId) {
            return res.status(400).json({ error: "Missing query or studentId" });
        }

        // 1️⃣ Validate student exists
        const studentExists = await prisma.users.findUnique({ where: { id: studentId } });
        if (!studentExists) return res.status(400).json({ error: "Invalid studentId" });

        // 2️⃣ Validate expert exists if provided
        if (expertId) {
            const expertExists = await prisma.users.findUnique({ where: { id: expertId } });
            if (!expertExists) return res.status(400).json({ error: "Invalid expertId" });
        }

        // 3️⃣ Get or create chat room
        let chatRoom = await prisma.chatRoom.findFirst({
            where: { studentId, expertId: expertId || null },
        });

        // if (!chatRoom) {

        //     chatRoom = await prisma.chatRoom.create({
        //         data: { studentId, expertId: expertId || null },
        //     });
        // }

        const chatRoomId = 'chatRoom.id';

        // 4️⃣ Save user message
        // await prisma.message.create({
        //     data: {
        //         content: query,
        //         senderType: Role.STUDENT,
        //         senderId: studentId,
        //         chatRoomId,
        //         isAI: false,
        //     },
        // });

        // 5️⃣ Parse intent
        const { intent, parameters } = await parseStudentQuery(query);

        let dbData: any = {};

        // 6️⃣ Query DB based on intent
        switch (intent) {
            case "Booking": {
                const { skill, date } = parameters;
                const requestedDate = date ? new Date(date) : new Date();
                const weekday = requestedDate.toLocaleString("en-US", { weekday: "long" });

                const experts = await prisma.expertProfile.findMany({
                    where: {
                        skills: { has: skill },
                        availableDays: { has: weekday },
                    },
                    include: {
                        user: { select: { name: true, email: true } },
                        chatRoomsAsExpert: true,
                    },
                });

                dbData = experts.filter(expert =>
                    !expert.chatRoomsAsExpert.some(
                        room => room.createdAt.toISOString().slice(0, 10) === requestedDate.toISOString().slice(0, 10)
                    )
                );
                break;
            }

            case "Reviews": {
                const { expertId } = parameters;
                dbData = await prisma.review.findMany({
                    where: { expertId },
                    orderBy: { createdAt: "desc" },
                    take: 5,
                });
                break;
            }

            case "Payments":
                dbData = await prisma.transaction.findMany({
                    where: { userId: studentId },
                    orderBy: { createdAt: "desc" },
                    take: 5,
                });
                break;

            case "FAQ":
                dbData = { answer: "You can book sessions, review experts, and check payments inside the app." };
                break;

            default:
                dbData = { answer: "I am not sure. Please rephrase your question." };
                break;
        }

        // 7️⃣ Fetch last 5 messages for AI context
        const chatContext = await prisma.message.findMany({
            where: { chatRoomId },
            orderBy: { createdAt: "desc" },
            take: 5,
        });
        chatContext.reverse(); // oldest first

        // 8️⃣ Generate AI response
        const aiResponse = await generateAIResponse(query, dbData, chatContext);

        // 9️⃣ Save AI response
        // await prisma.message.create({
        //     data: {
        //         content: aiResponse,
        //         senderType: "ADMIN",
        //         senderId: "AI",
        //         chatRoomId,
        //         isAI: true,
        //     },
        // });

        res.json({ response: aiResponse, dbData, chatRoomId });
    } catch (err) {
        console.error("Chatbot error:", err);
        res.status(500).json({ error: err?.message });
    }
}
