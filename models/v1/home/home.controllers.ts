import type { Request, Response } from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import type { AuthenticatedRequest } from "../../../middleware/verifyUsers";

const prisma = new PrismaClient();

export const getExperts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { search, page = '1', limit = '10', skills } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.UsersWhereInput = {
      activeProfile: 'EXPERT',
    };

    const andConditions: Prisma.UsersWhereInput[] = [];

    if (search && (search as string).trim() !== '') {
      const searchString = search as string;
      andConditions.push({
        name: { contains: searchString, mode: 'insensitive' }
      });
    }

    if (skills) {
      const skillsArray = (skills as string).split(',').map(s => s.trim()).filter(s => s);
      if (skillsArray.length > 0) {
        andConditions.push({
          expertProfile: {
            skills: {
              hasSome: skillsArray,
            },
          },
        });
      }
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const experts = await prisma.users.findMany({
      where,
      include: {
        expertProfile: true,
      },
      take: limitNum,
      skip,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const totalExperts = await prisma.users.count({ where });

    res.status(200).json({
      success: true,
      message: "Experts fetched successfully",
      data: experts,
      meta: {
        total: totalExperts,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalExperts / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching experts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch experts",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const getExpertById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        message: "Expert ID is required",
      });
      return;
    }

    const expert = await prisma.users.findUnique({
      where: {
        id,
        activeProfile: 'EXPERT',
      },
      include: {
        expertProfile: true,
      },
    });

    if (!expert) {
      res.status(404).json({
        success: false,
        message: "Expert not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Expert fetched successfully",
      data: expert,
    });
  } catch (error) {
    console.error("Error fetching expert by ID:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch expert",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const getSchedule = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { status } = req.query;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }


    const bookings = await prisma.booking.findMany({
      where: {
        studentId: userId,
      },
      orderBy: {
        date: 'desc',
      },
    });


    res.status(200).json({
      success: true,
      message: "Schedule fetched successfully",
      data: bookings
    });
  } catch (error) {
    console.error("Error fetching schedule:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch schedule",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const stats = async (req: Request, res: Response) => {
  try {
    const [total_experts, total_bookings, total_users, avg_ratings] = await Promise.all([
      prisma.expertProfile.count(),
      prisma.booking.count(),
      prisma.users.count(),
      prisma.review.aggregate({
        _avg: {
          rating: true,
        },
      })
    ])

    res.status(200).json({
      success: true,
      message: "Stats fetched successfully",
      data: {
        mentors: total_experts,
        sessions: total_bookings,
        users: total_users,
        rating: avg_ratings._avg.rating.toFixed(2)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get stats",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}
