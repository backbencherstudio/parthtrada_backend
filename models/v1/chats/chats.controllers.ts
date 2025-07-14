import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import type { AuthenticatedRequest } from "../../../middleware/verifyUsers";
import { io } from "../../../socketServer";

const prisma = new PrismaClient();

// Check if chat is allowed between users
export const checkChatAccess = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { otherUserId } = req.params;

    if (!userId || !otherUserId) {
       res.status(400).json({
        success: false,
        message: "User IDs are required",
      });
      return
    }

    if (userId === otherUserId) {
       res.status(400).json({
        success: false,
        message: "Cannot chat with yourself",
      });
      return
    }

 
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [
          { studentId: userId, expertId: otherUserId },
          { studentId: otherUserId, expertId: userId },
        ],
        status: {
          in: ["UPCOMING", "COMPLETED"],
        },
      },
    });

     res.json({
      success: true,
      canChat: !!booking,
    });
  } catch (error) {
     res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

// Get or create chat room
export const getChatRoom = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { otherUserId } = req.params;

    if (!userId || !otherUserId) {
       res.status(400).json({
        success: false,
        message: "User IDs are required",
      });
      return
    }

    if (userId === otherUserId) {
       res.status(400).json({
        success: false,
        message: "Cannot create chat room with yourself",
      });
      return
    }

    // Get both users' profiles
    const [currentUser, otherUser] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: { studentProfile: true, expertProfile: true },
      }),
      prisma.user.findUnique({
        where: { id: otherUserId },
        include: { studentProfile: true, expertProfile: true },
      }),
    ]);

    if (!currentUser || !otherUser) {
       res.status(404).json({
        success: false,
        message: "User not found",
      });
      return
    }

    // Determine student and expert profiles
    const studentProfile = 
      currentUser.activeProfile === 'STUDENT' ? currentUser.studentProfile :
      otherUser.activeProfile === 'STUDENT' ? otherUser.studentProfile :
      null;

    const expertProfile = 
      currentUser.activeProfile === 'EXPERT' ? currentUser.expertProfile :
      otherUser.activeProfile === 'EXPERT' ? otherUser.expertProfile :
      null;

    if (!studentProfile || !expertProfile) {
       res.status(400).json({
        success: false,
        message: "Both student and expert profiles are required for chat",
      });
      return
    }

    // Get or create chat room
    const chatRoom = await prisma.chatRoom.upsert({
      where: {
        studentId_expertId: {
          studentId: studentProfile.id,
          expertId: expertProfile.id,
        },
      },
      create: {
        studentId: studentProfile.id,
        expertId: expertProfile.id,
      },
      update: {},
      include: {
        student: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
        expert: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

     res.json({
      success: true,
      chatRoom,
    });
  } catch (error) {
    console.error("Chat room error:", error);
     res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

// Get chat messages
export const getChatMessages = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?.id;

    // Verify user has access to this chat room
    const chatRoom = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        student: { include: { user: true } },
        expert: { include: { user: true } },
      },
    });

    if (!chatRoom) {
       res.status(404).json({
        success: false,
        message: "Chat room not found",
      });
      return
    }

    // Check if current user is either student or expert in this chat
    const isParticipant = 
      chatRoom.student.user.id === userId || 
      chatRoom.expert.user.id === userId;

    if (!isParticipant) {
       res.status(403).json({
        success: false,
        message: "Unauthorized access to chat room",
      });
      return
    }

    const messages = await prisma.message.findMany({
      where: { chatRoomId: roomId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

     res.json({
      success: true,
      messages: messages.reverse(), 
    });
  } catch (error) {
     res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

// Send message
export const sendMessage = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?.id;
    const { content } = req.body;

    if (!content?.trim()) {
       res.status(400).json({
        success: false,
        message: "Message content is required and cannot be empty",
      });
      return
    }

    // Verify chat room exists and user has access
    const chatRoom = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        student: { include: { user: true } },
        expert: { include: { user: true } },
      },
    });

    if (!chatRoom) {
       res.status(404).json({
        success: false,
        message: "Chat room not found",
      });
      return
    }

    // Check if current user is participant
    const isStudent = chatRoom.student.user.id === userId;
    const isExpert = chatRoom.expert.user.id === userId;

    if (!isStudent && !isExpert) {
       res.status(403).json({
        success: false,
        message: "Unauthorized to send message in this chat",
      });
      return
    }

    // Create message with better validation
    const message = await prisma.message.create({
      data: {
        content: content.trim(),
        senderType: isStudent ? 'STUDENT' : 'EXPERT',
        senderId: userId,
        chatRoomId: roomId,
      },
      include: {
        chatRoom: true
      }
    });

    // Emit socket event with enhanced data
    io.to(roomId).emit('new_message', {
      ...message,
      sender: {
        id: userId,
        name: req.user?.name,
        image: req.user?.image,
        type: isStudent ? 'STUDENT' : 'EXPERT'
      },
    });

    // Update chat room last activity
    await prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });

    return res.status(201).json({
      success: true,
      message,
    });
  } catch (error) {
    console.error("Send message error:", error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

// Get user's chat list
export const getChatList = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    // Get user's profile
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        studentProfile: true,
        expertProfile: true,
      },
    });

    if (!user) {
       res.status(404).json({
        success: false,
        message: "User not found",
      });
      return
    }

    let chatRooms = [];

    if (user.activeProfile === 'STUDENT' && user.studentProfile) {
      chatRooms = await prisma.chatRoom.findMany({
        where: { studentId: user.studentProfile.id },
        include: {
          expert: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
    } else if (user.activeProfile === 'EXPERT' && user.expertProfile) {
      chatRooms = await prisma.chatRoom.findMany({
        where: { expertId: user.expertProfile.id },
        include: {
          student: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

     res.json({
      success: true,
      chatRooms,
    });
  } catch (error) {
    console.error("Get chat list error:", error);
     res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

// Mark messages as read
export const markMessagesAsRead = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;

    // Get message to find chat room
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        chatRoom: {
          include: {
            student: { include: { user: true } },
            expert: { include: { user: true } },
          },
        },
      },
    });

    if (!message) {
       res.status(404).json({
        success: false,
        message: "Message not found",
      });
      return
    }

    // Verify user is participant
    const isParticipant = 
      message.chatRoom.student.user.id === userId || 
      message.chatRoom.expert.user.id === userId;

    if (!isParticipant) {
       res.status(403).json({
        success: false,
        message: "Unauthorized to mark messages as read",
      });
      return
    }

    // Emit socket event
    io.to(message.chatRoomId).emit('messages_read', {
      readerId: userId,
      messageIds: [messageId],
    });

     res.json({
      success: true,
      message: "Message marked as read",
    });
  } catch (error) {
    console.error("Mark messages read error:", error);
     res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

// Delete message
export const deleteMessage = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;

    // Get message to verify ownership
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        chatRoom: {
          include: {
            student: { include: { user: true } },
            expert: { include: { user: true } },
          },
        },
      },
    });

    if (!message) {
       res.status(404).json({
        success: false,
        message: "Message not found",
      });
      return
    }

    // Verify user is the sender
    if (message.senderId !== userId) {
       res.status(403).json({
        success: false,
        message: "Unauthorized to delete this message",
      });
      return
    }

    // Delete message
    await prisma.message.delete({
      where: { id: messageId },
    });

    // Emit socket event
    io.to(message.chatRoomId).emit('message_deleted', {
      messageId,
      deletedBy: userId,
    });

     res.json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("Delete message error:", error);
     res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

// Edit message
export const editMessage = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;
    const { content } = req.body;

    if (!content) {
       res.status(400).json({
        success: false,
        message: "Content is required",
      });
      return
    }

    // Get message to verify ownership
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        chatRoom: {
          include: {
            student: { include: { user: true } },
            expert: { include: { user: true } },
          },
        },
      },
    });

    if (!message) {
       res.status(404).json({
        success: false,
        message: "Message not found",
      });
      return
    }

    // Verify user is the sender
    if (message.senderId !== userId) {
       res.status(403).json({
        success: false,
        message: "Unauthorized to edit this message",
      });
      return
    }

    // Update message
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { content },
    });

    // Emit socket event
    io.to(message.chatRoomId).emit('message_updated', updatedMessage);

     res.json({
      success: true,
      message: updatedMessage,
    });
  } catch (error) {
    console.error("Edit message error:", error);
     res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

// Get unread message count
export const getUnreadCount = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    // Get user's profile
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        studentProfile: true,
        expertProfile: true,
      },
    });

    if (!user) {
       res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let unreadCount = 0;

    if (user.activeProfile === 'STUDENT' && user.studentProfile) {
      // Count unread messages in student's chat rooms where sender is expert
      unreadCount = await prisma.message.count({
        where: {
          chatRoom: {
            studentId: user.studentProfile.id
          },
          senderType: 'EXPERT',
          isRead: false
        },
      });
    } else if (user.activeProfile === 'EXPERT' && user.expertProfile) {
      // Count unread messages in expert's chat rooms where sender is student
      unreadCount = await prisma.message.count({
        where: {
          chatRoom: {
            expertId: user.expertProfile.id
          },
          senderType: 'STUDENT',
          isRead: false
        },
      });
    }

     res.json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error("Get unread count error:", error);
     res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

// Add a new controller to mark messages as read
export const markMessageAsRead = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;

    // Get message and verify access
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        chatRoom: {
          include: {
            student: { include: { user: true } },
            expert: { include: { user: true } },
          },
        },
      },
    });

    if (!message) {
       res.status(404).json({
        success: false,
        message: "Message not found",
      });
      return
    }

    // Verify user has access to this message
    const isParticipant =
      message.chatRoom.student.user.id === userId ||
      message.chatRoom.expert.user.id === userId;

    if (!isParticipant) {
       res.status(403).json({
        success: false,
        message: "Unauthorized access to message",
      });
      return
    }

    // Only mark as read if recipient is viewing
    const isRecipient =
      (message.senderType === 'EXPERT' && message.chatRoom.student.user.id === userId) ||
      (message.senderType === 'STUDENT' && message.chatRoom.expert.user.id === userId);

    if (!isRecipient) {
       res.status(400).json({
        success: false,
        message: "Can only mark received messages as read",
      });
      return
    }

    // Update message read status
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { isRead: true },
    });

    // Emit socket event for real-time updates
    io.to(message.chatRoomId).emit('message_read', {
      messageId,
      readBy: userId,
    });

     res.json({
      success: true,
      message: updatedMessage,
    });
  } catch (error) {
    console.error("Mark message as read error:", error);
     res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};