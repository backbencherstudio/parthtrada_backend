import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default async function createMessage({ content, recipientId, user_id }: { user_id: string, recipientId: string, content: string }) {

    const user = await prisma.users.findUnique({
        where: { id: user_id },
        select: { id: true, activeProfile: true }
    });

    if (!user) {
        throw new Error('User not found.')
    }

    const conversationId = null;
    if (user.id === recipientId) {
        throw new Error('Cannot send message to yourself.')
    }

    const recipient = await prisma.users.findUnique({
        where: { id: recipientId },
        select: { id: true, activeProfile: true }
    });

    if (!recipient) {
        return {
            success: false,
            message: 'recipientId is required.'
        }
    }

    try {
        let conversation = null;

        if (conversationId) {
            conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
            if (!conversation) {
                return {
                    success: false,
                    message: 'Conversation not found.'
                }
            }
        } else {
            conversation = await prisma.conversation.findFirst({
                where: {
                    OR: [
                        {
                            senderId: user.id,
                            recipientId: recipient.id,
                            senderRole: user.activeProfile,
                            recipientRole: recipient.activeProfile,
                        },
                        {
                            senderId: recipient.id,
                            recipientId: user.id,
                            senderRole: recipient.activeProfile,
                            recipientRole: user.activeProfile,
                        },
                    ],
                },
            });

            // create if not exists
            if (!conversation) {
                conversation = await prisma.conversation.create({
                    data: {
                        senderId: user.id,
                        recipientId: recipient.id,
                        senderRole: user.activeProfile,
                        recipientRole: recipient.activeProfile,
                    },
                });
            }
        }

        // create message
        const message = await prisma.message.create({
            data: {
                conversationId: conversation.id,
                senderId: user.id,
                recipientId: recipient.id,
                senderRole: user.activeProfile,
                recipientRole: recipient.activeProfile,
                content,
            },
            include: {
                sender: { select: { id: true, name: true, image: true } },
            },
        });

        // bump updatedAt
        await prisma.conversation.update({
            where: { id: conversation.id },
            data: { updatedAt: new Date() },
        });

        return message
    } catch (err: any) {
        return {
            success: false,
            message: 'Internal server error.'
        }
    }
}
