import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthenticatedRequest } from "@/middleware/verifyUsers";
import { createConversationSchema, sendMessageSchema } from "@/utils/validations";
import { paginationQuerySchema } from "@/utils/queryValidation";

const prisma = new PrismaClient();

// Create conversation
export const createConversation = async (req: AuthenticatedRequest, res: Response) => {
  const user_id = req.user?.id
  const user = await prisma.users.findUnique({
    where: {
      id: user_id
    },
    select: {
      id: true,
      activeProfile: true
    }
  })

  const { data, error, success } = createConversationSchema.safeParse(req.body);
  if (!success) {
    if (!success) {
      return res.status(400).json({
        success: false,
        errors: JSON.parse(error.message).map(err => ({
          field: err.path.join("."),
          message: err.message,
        })),
      });
    }
  }

  const { recipientId, recipientRole } = data;

  if (user.id === recipientId) {
    return res.status(400).json({ error: "Cannot create conversation with yourself" });
  }

  const existing = await prisma.conversation.findFirst({
    where: {
      OR: [
        { senderId: user.id, recipientId, senderRole: user.activeProfile, recipientRole },
        { senderId: recipientId, recipientId: user.id, senderRole: recipientRole, recipientRole: user.activeProfile },
      ],
    },
    include: { sender: true, recipient: true },
  });

  if (existing) return res.json(existing);

  const conversation = await prisma.conversation.create({
    data: {
      senderId: user.id,
      recipientId,
      senderRole: user.activeProfile,
      recipientRole,
    },
    include: { sender: true, recipient: true },
  });

  res.json(conversation);
};


// Conversations list
export const conversations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user_id = req.user?.id
    const user = await prisma.users.findUnique({
      where: {
        id: user_id
      },
      select: {
        activeProfile: true
      }
    })

    if (!user) {
      res.status(404).json({
        message: 'User not found.'
      })
      return
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { senderId: user_id, senderRole: user.activeProfile },
          { recipientId: user_id, recipientRole: user.activeProfile }
        ]
      },
      include: {
        sender: { select: { id: true, name: true, image: true } },
        recipient: { select: { id: true, name: true, image: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });


    res.status(200).json({
      success: true,
      message: 'Conversations fetched successfully.',
      data: conversations,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

// Send Message
export const sendMessage = async (req: AuthenticatedRequest, res: Response) => {
  const user_id = req.user?.id
  const user = await prisma.users.findUnique({
    where: {
      id: user_id
    },
    select: {
      id: true,
      activeProfile: true
    }
  })

  if (!user) {
    res.status(404).json({
      message: 'User not found.'
    })
    return
  }

  const { data, error, success } = sendMessageSchema.safeParse(req.body);
  if (!success) {
    if (!success) {
      return res.status(400).json({
        success: false,
        errors: JSON.parse(error.message).map(err => ({
          field: err.path.join("."),
          message: err.message,
        })),
      });
    }
  }

  const { conversationId, recipientId, recipientRole, content } = data;

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId: user.id,
      recipientId,
      senderRole: user.activeProfile,
      recipientRole,
      content,
    },
    include: {
      sender: { select: { id: true, name: true, image: true } },
      recipient: { select: { id: true, name: true, image: true } },
    },
  });

  // bump conversation timestamp
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  res.json(message);
};

export const messages = async (req: Request, res: Response) => {
  try {
    const result = paginationQuerySchema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        success: false,
        message: "Invalid query parameters",
        errors: result.error.flatten().fieldErrors,
      });
      return
    }

    const { page, perPage } = result.data;
    const skip = (page - 1) * perPage;

    const conversationId = req.params.conversation_id

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      skip,
      take: perPage,
      include: {
        sender: { select: { id: true, name: true, image: true } }
      }
    });

    const total = await prisma.booking.count();

    res.status(200).json({
      success: true,
      message: 'Messages fetched successfully.',
      data: messages,
      pagination: {
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
        hasNextPage: page * perPage < total,
        hasPrevPage: page > 1,
      },
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages.',
      error: 'Something went wrong.'
    })
  }
}
