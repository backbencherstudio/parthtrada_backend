import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthenticatedRequest } from "@/middleware/verifyUsers";
import { createConversationSchema, sendMessageSchema } from "@/utils/validations";
import { paginationQuerySchema } from "@/utils/queryValidation";
import createMessage from "@/services/sendMessage";

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
    return res.status(400).json({
      success: false,
      errors: JSON.parse(error.message).map(err => ({
        field: err.path.join("."),
        message: err.message,
      })),
    });
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

  if (existing) {
    return res.json(existing);
  }

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
        AND: [
          {
            OR: [
              { senderId: user_id, senderRole: user.activeProfile },
              { recipientId: user_id, recipientRole: user.activeProfile },
            ],
          },
          { messages: { some: {} } },
        ],
      },
      include: {
        sender: { select: { id: true, name: true, image: true } },
        recipient: { select: { id: true, name: true, image: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    });

    const normalized = conversations.map(conv => {
      const participant =
        conv.senderId === user_id && conv.senderRole === user.activeProfile
          ? conv.recipient
          : conv.sender;

      return {
        id: conv.id,
        recipientId: participant.id,
        messages: [conv.messages[0] || null],
        sender: participant,
        updatedAt: conv.updatedAt,
      };
    });

    res.status(200).json({
      success: true,
      message: "Conversations fetched successfully.",
      data: normalized,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

export const getConversationId = async (req: AuthenticatedRequest, res: Response) => {
  const user_id = req.user?.id;

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { id: true, activeProfile: true },
  });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const { recipientId } = req.body;
  if (!recipientId) {
    return res.status(400).json({ error: "recipientId is required" });
  }

  if (recipientId === user.id) {
    return res.status(400).json({ error: "Cannot create conversation with yourself" });
  }

  const recipient = await prisma.users.findUnique({
    where: { id: recipientId },
    select: { id: true, activeProfile: true },
  });

  if (!recipient) {
    return res.status(404).json({ error: "Recipient not found" });
  }

  try {
    let conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          { senderId: user.id, recipientId, senderRole: user.activeProfile, recipientRole: recipient.activeProfile },
          { senderId: recipientId, recipientId: user.id, senderRole: recipient.activeProfile, recipientRole: user.activeProfile },
        ],
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          senderId: user.id,
          recipientId,
          senderRole: user.activeProfile,
          recipientRole: recipient.activeProfile,
        },
      });
    }

    return res.status(200).json({
      success: true,
      conversationId: conversation.id,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
};

// Send Message
export const sendMessage = async (req: AuthenticatedRequest, res: Response) => {
  const user_id = req.user?.id;

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { id: true, activeProfile: true }
  });

  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }

  const { success, data, error } = sendMessageSchema.safeParse(req.body);
  if (!success) {
    return res.status(400).json({
      success: false,
      errors: JSON.parse(error.message).map(err => ({
        field: err.path.join("."),
        message: err.message,
      })),
    });
  }

  const { content, recipientId } = data;
  const conversationId = null;
  if (user.id === recipientId) {
    return res.status(400).json({ error: "Cannot send message to yourself" });
  }

  const recipient = await prisma.users.findUnique({
    where: { id: recipientId },
    select: { id: true, activeProfile: true }
  });

  if (!recipient) {
    return res.status(404).json({ error: "Recipient not found" });
  }

  try {

    const message = await createMessage({ content, recipientId: recipient.id, user_id })

    return res.status(201).json({
      success: true,
      data: message
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
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
      return;
    }

    const { page, perPage } = result.data;
    const skip = (page - 1) * perPage;

    const conversationId = req.params.conversation_id;
    const userId = (req as any).user?.id;

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      skip,
      take: perPage,
      include: {
        sender: { select: { id: true, name: true, image: true } },
        recipient: { select: { id: true, name: true, image: true } }
      }
    });

    const updatedMessages = messages.map(msg => ({
      ...msg,
      me: msg.senderId === userId
    }));

    const total = await prisma.message.count({
      where: { conversationId }
    });

    res.status(200).json({
      success: true,
      message: 'Messages fetched successfully.',
      data: updatedMessages,
      pagination: {
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
        hasNextPage: page * perPage < total,
        hasPrevPage: page > 1,
      },
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages.',
      error: 'Something went wrong.'
    });
  }
};
