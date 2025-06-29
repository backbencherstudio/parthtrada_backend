import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import type { AuthenticatedRequest } from "../../../middleware/verifyUsers";

const prisma = new PrismaClient();

// Check if chat is allowed between users
export const checkChatAccess = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { expertId } = req.params;

    // Check if there's an active booking between the users
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [
          { studentId: userId, expertId },
          { studentId: expertId, expertId: userId },
        ],
        status: {
          in: ["UPCOMING", "COMPLETED"],
        },
      },
    });

    if (!booking) {
      res.status(403).json({
        success: false,
        message: "No active booking found between users",
      });
      return;
    }

    res.json({
      success: true,
      canChat: true,
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
    const { expertId } = req.params;

    // Get user profiles
    const [userProfile, expertProfile] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: { studentProfile: true, expertProfile: true },
      }),
      prisma.user.findUnique({
        where: { id: expertId },
        include: { studentProfile: true, expertProfile: true },
      }),
    ]);

    if (!userProfile || !expertProfile) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // Determine student and expert IDs based on active profiles
    let studentProfileId: string | null = null;
    let expertProfileId: string | null = null;

    if (
      userProfile.activeProfile === "STUDENT" &&
      expertProfile.activeProfile === "EXPERT"
    ) {
      studentProfileId = userProfile.studentProfile?.id || null;
      expertProfileId = expertProfile.expertProfile?.id || null;
    } else if (
      userProfile.activeProfile === "EXPERT" &&
      expertProfile.activeProfile === "STUDENT"
    ) {
      studentProfileId = expertProfile.studentProfile?.id || null;
      expertProfileId = userProfile.expertProfile?.id || null;
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid user roles for chat",
      });
      return;
    }

    if (!studentProfileId || !expertProfileId) {
      res.status(400).json({
        success: false,
        message: "Missing required profiles",
      });
      return;
    }

    // Get or create chat room
    const chatRoom = await prisma.chatRoom.upsert({
      where: {
        studentId_expertId: {
          studentId: studentProfileId,
          expertId: expertProfileId,
        },
      },
      create: {
        studentId: studentProfileId,
        expertId: expertProfileId,
      },
      update: {},
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
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

    const messages = await prisma.message.findMany({
      where: { chatRoomId: roomId },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      success: true,
      messages,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};
