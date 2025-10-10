import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { dashboardExpertsQuerySchema, sessionsQuerySchema, transactionsQuerySchema, usersQuerySchema } from "@/utils/queryValidation";
import { AuthenticatedRequest } from "@/middleware/verifyUsers";
import { adminProfileSchema, changeExpertStatus } from "@/utils/validations";
import getDashboardStats from "@/utils/getDashboardStats";

const prisma = new PrismaClient();

export const dashboard = async (req: Request, res: Response): Promise<void> => {
  try {

    const { expertCount, studentCount, summary, totalUsers } = await getDashboardStats()

    // percentage calculation
    const studentPercent = totalUsers ? Math.round((studentCount / totalUsers) * 100) : 0;
    const expertPercent = 100 - studentPercent;

    // Monthly stats for current year
    const year = new Date().getFullYear();

    const bookingsMonthlyRaw: Array<{ month: number; count: number }> = await prisma.$queryRaw`SELECT EXTRACT(MONTH FROM "date")::int AS month, COUNT(*)::int AS count FROM "Booking" WHERE EXTRACT(YEAR FROM "date") = ${year} GROUP BY month ORDER BY month`;

    const completedMonthlyRaw: Array<{ month: number; count: number }> = await prisma.$queryRaw`SELECT EXTRACT(MONTH FROM "date")::int AS month, COUNT(*)::int AS count FROM "Booking" WHERE EXTRACT(YEAR FROM "date") = ${year} AND "status" = 'COMPLETED' GROUP BY month ORDER BY month`;

    // Initialize arrays with 0
    const bookingsPerMonth = Array(12).fill(0);
    const completedPerMonth = Array(12).fill(0);

    bookingsMonthlyRaw.forEach(({ month, count }) => {
      bookingsPerMonth[month - 1] = count;
    });
    completedMonthlyRaw.forEach(({ month, count }) => {
      completedPerMonth[month - 1] = count;
    });

    // Get latest 4 users
    const latestUsers = await prisma.users.findMany({
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: {
        id: true,
        name: true,
        image: true,
        activeProfile: true,
        email: true,
        createdAt: true,
      },
    });

    // Get latest 4 experts with details
    const latestExpertsRaw = await prisma.users.findMany({
      where: { activeProfile: "EXPERT" },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: {
        id: true,
        name: true,
        image: true,
        email: true,
        createdAt: true,
        expertProfile: {
          select: { hourlyRate: true }
        }
      }
    });

    // For each expert, get session count, student count, and rating
    const latestExperts = await Promise.all(latestExpertsRaw.map(async (expert) => {
      const totalSessions = await prisma.booking.count({ where: { expertId: expert.id } });
      const totalStudents = await prisma.booking.findMany({
        where: { expertId: expert.id },
        select: { studentId: true },
        distinct: ['studentId'],
      });
      const ratingAgg = await prisma.review.aggregate({
        where: { expertId: expert.id },
        _avg: { rating: true }
      });
      return {
        id: true,
        name: expert.name,
        email: expert.email,
        image: true,
        sessionFee: expert.expertProfile?.hourlyRate,
        totalSession: totalSessions,
        totalStudent: totalStudents.length,
        rating: ratingAgg._avg.rating ?? null,
        joinDate: expert.createdAt,
      };
    }));

    // Get latest 5 sessions (bookings)
    const latestSessionsRaw = await prisma.booking.findMany({
      orderBy: { date: 'desc' },
      take: 5,
      include: {
        student: { select: { name: true, image: true } },
        expert: { select: { name: true, image: true, expertProfile: { select: { hourlyRate: true } } } },
        transaction: { select: { amount: true } },
      },
    });

    const latestSessions = latestSessionsRaw.map(session => ({
      student: {
        name: session.student?.name ?? null,
        image: session.student?.image ?? null,
      },
      expert: {
        name: session.expert?.name ?? null,
        image: session.expert?.image ?? null,
      },
      sessionFee: session.transaction?.amount ?? session.expert?.expertProfile?.hourlyRate ?? null,
      duration: session.sessionDuration,
      date: session.date,
      time: session.expertDateTime, // or session.studentDateTime if needed
      status: session.status,
    }));

    res.json({
      success: true,
      data: {
        totals: summary,
        userRole: {
          students: { count: studentCount, percent: studentPercent },
          experts: { count: expertCount, percent: expertPercent },
        },
        monthly: {
          bookings: bookingsPerMonth,
          completed: completedPerMonth,
        },
        latestUsers,
        latestExperts,
        latestSessions,
      },
    });
  } catch (error) {
    console.error("Dashboard error", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const users = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = usersQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
        errors: query.error.flatten().fieldErrors,
      });
      return
    }

    const { page, perPage, role, search } = query.data;
    const skip = (page - 1) * perPage;

    // Build where clause
    let where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role) {
      where.activeProfile = role;
    }

    const [total, users] = await Promise.all([
      prisma.users.count({ where }),
      prisma.users.findMany({
        skip,
        take: Number(perPage),
        orderBy: { createdAt: 'desc' },
        where,
        select: {
          id: true,
          name: true,
          image: true,
          email: true,
          activeProfile: true,
          createdAt: true,
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          total,
          page,
          perPage,
          totalPages: Math.ceil(total / perPage),
          hasNextPage: page * perPage < total,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard users list error", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const userById = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params?.id;
    if (!id) {
      return res.status(400).json({ success: false, message: "Please provide expert ID." });
    }

    const { studentProfile, ...user } = await prisma.users.findUnique({
      where: { id: id },
      include: {
        studentProfile: true,
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    return res.status(200).json({
      success: true,
      message: "User fetched successfully.",
      data: {
        ...user,
        meta: studentProfile
      },
    });
  } catch (error) {
    console.error("Dashboard experts list error", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const experts = async (req: Request, res: Response): Promise<void> => {
  try {

    const query = dashboardExpertsQuerySchema.safeParse(req.query);

    if (!query.success) {
      res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
        errors: query.error.flatten().fieldErrors,
      });
      return
    }

    const { page, perPage, search, sortBy, status } = query.data;
    const skip = (page - 1) * perPage;

    // Build where clause
    let where: any = { activeProfile: 'EXPERT' };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.expertBookings = {
        some: { status: status }
      };
    }

    // totalSession
    const [total, expertsRaw] = await Promise.all([
      prisma.users.count({ where }),
      prisma.users.findMany({
        skip,
        take: Number(perPage),
        orderBy: { createdAt: 'desc' },
        where,
        select: {
          id: true,
          name: true,
          image: true,
          email: true,
          activeProfile: true,
          createdAt: true,
          expertProfile: { select: { hourlyRate: true } },
        },
      }),
    ])

    // For each expert, get rating and total students
    const experts = await Promise.all(expertsRaw.map(async ({ expertProfile, ...expert }) => {
      const bookings = await prisma.booking.count({
        where: { expertId: expert.id },
      })
      const totalStudents = await prisma.booking.findMany({
        where: { expertId: expert.id },
        select: { studentId: true },
        distinct: ['studentId'],
      });
      const ratingAgg = await prisma.review.aggregate({
        where: { expertId: expert.id },
        _avg: { rating: true }
      });
      return {
        ...expert,
        totalStudent: totalStudents.length,
        sessionFee: expertProfile.hourlyRate,
        totalSession: bookings,
        rating: ratingAgg._avg.rating ?? null,
        joinDate: expert.createdAt,

      };
    }));

    // Sort by requested field
    if (sortBy === 'rating') {
      experts.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (sortBy === 'totalStudent') {
      experts.sort((a, b) => b.totalStudent - a.totalStudent);
    }

    res.json({
      success: true,
      data: {
        experts,
        pagination: {
          total,
          page,
          perPage,
          totalPages: Math.ceil(total / perPage),
          hasNextPage: page * perPage < total,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard experts list error", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const sessions = async (req: Request, res: Response): Promise<void> => {
  try {

    const query = sessionsQuerySchema.safeParse(req.query);

    if (!query.success) {
      res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
        errors: query.error.flatten().fieldErrors,
      });
      return
    }

    const { expert_id, page, perPage, search, status } = query.data;

    const skip = (Number(page) - 1) * Number(perPage);

    // Build where clause
    let where: any = {};
    // Status filter
    if (status) {
      where.status = status
    }
    if (expert_id) {
      where.expertId = expert_id
    }
    // Search filter (student or expert name)
    if (search) {
      where.OR = [
        { student: { name: { contains: search, mode: 'insensitive' } } },
        { expert: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [total, sessions] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        skip,
        take: Number(perPage),
        orderBy: { date: 'desc' },
        where,
        include: {
          student: { select: { name: true, image: true } },
          expert: { select: { name: true, image: true, expertProfile: { select: { hourlyRate: true } } } },
          transaction: { select: { amount: true } },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        sessions,
        pagination: {
          total,
          page,
          perPage,
          totalPages: Math.ceil(total / perPage),
          hasNextPage: page * perPage < total,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard sessions list error", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const transactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = transactionsQuerySchema.safeParse(req.query);

    if (!query.success) {
      res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
        errors: query.error.flatten().fieldErrors,
      });
      return
    }

    const { page, perPage, search, status } = query.data;
    const skip = (Number(page) - 1) * Number(perPage);

    let where: any = {};
    if (status) {
      where.booking = { status: status };
    }
    if (search) {
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { booking: { student: { name: { contains: search, mode: 'insensitive' } } } },
          { booking: { expert: { name: { contains: search, mode: 'insensitive' } } } },
        ]
      });
    }

    const [total, transactions] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        skip,
        take: Number(perPage),
        orderBy: { createdAt: 'desc' },
        where,
        include: {
          booking: {
            select: {
              date: true,
              expertDateTime: true, // or studentDateTime if you want
              status: true,
              student: { select: { name: true } }, // or expert: { select: { name: true } }
              expert: { select: { name: true } },
            }
          }
        },
      }),
    ]);

    const formattedTransactions = transactions.map(tx => ({
      name: tx.booking?.student?.name || tx.booking?.expert?.name || null, // prefer student, fallback to expert
      date: tx.booking?.date ?? null,
      time: tx.booking?.expertDateTime ?? null, // or studentDateTime
      amount: tx.amount,
      status: tx.booking?.status ?? null,
    }));

    res.json({
      success: true,
      data: {
        transactions: formattedTransactions,
        pagination: {
          total,
          page,
          perPage,
          totalPages: Math.ceil(total / perPage),
          hasNextPage: page * perPage < total,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard transactions list error", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};


export const dashboardRefundsList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 10, search = '', status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Always filter for refund transactions
    let where: any = { status: 'REFUNDED' };

    // Filter by booking status if provided
    if (status) {
      if (status === 'not joined') {
        where.booking = { status: 'MISSED' };
      } else if (status === 'cancled') {
        where.booking = { status: 'REFUNDED' };
      }
    }

    // Search by student or expert name
    if (search) {
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { booking: { student: { name: { contains: search, mode: 'insensitive' } } } },
          { booking: { expert: { name: { contains: search, mode: 'insensitive' } } } },
        ]
      });
    }

    const [totalRefunds, refunds] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        where,
        include: {
          booking: {
            select: {
              date: true,
              expertDateTime: true,
              status: true,
              student: { select: { name: true } },
              expert: { select: { name: true } },
            }
          }
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalRefunds,
        refunds,
      },
    });
  } catch (error) {
    console.error("Dashboard refunds list error", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const updateProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user_id = req.user?.id

    const body = adminProfileSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        success: false,
        message: "Invalid query parameters",
        errors: body.error.flatten().fieldErrors,
      });
      return
    }

    const { email, first_name, last_name, phone } = body.data

    const profile = await prisma.users.update({
      where: {
        id: user_id
      },
      data: {
        email,
        phone,
      },
      select: {
        email: true,
        phone: true
      }
    })

    const admin_profile = await prisma.adminProfile.upsert({
      where: {
        userId: user_id
      },
      update: {
        first_name: first_name,
        last_name
      },
      create: {
        userId: user_id,
        first_name,
        last_name,
      }
    })

    res.status(200).json({
      message: 'Profile updated successfully.',
      data: {
        first_name: admin_profile.first_name,
        last_name: admin_profile.last_name,
        phone: profile.phone,
        email: profile.email,
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

export const expertById = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params?.id;
    if (!id) {
      return res.status(400).json({ success: false, message: "Please provide expert ID." });
    }

    const expert = await prisma.expertProfile.findUnique({
      where: { userId: id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            studentProfile: true,
            createdAt: true
          },
        },
      },
    });

    if (!expert) {
      return res.status(404).json({ success: false, message: "Expert not found." });
    }

    const grouped = await prisma.review.groupBy({
      by: ["rating"],
      where: { expertId: expert.userId },
      _count: { rating: true },
    });

    const totalReviews = grouped.reduce((sum, g) => sum + g._count.rating, 0);
    const ratingCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const g of grouped) ratingCounts[g.rating] = g._count.rating;

    const averageRating =
      totalReviews > 0
        ? (
          Object.entries(ratingCounts).reduce(
            (sum, [rating, count]) => sum + Number(rating) * count,
            0
          ) / totalReviews
        ).toFixed(2)
        : null;

    const studentCount = await prisma.booking.groupBy({
      by: ['studentId'],
      where: {
        expertId: expert.userId,
        studentId: { not: null },
      },
      _count: {
        studentId: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Expert fetched successfully.",
      data: {
        expert: {
          id: expert.id,
          name: expert.user.name,
          image: expert.user.image,
          metadata: {
            status: expert.status,
            description: expert.description,
            ratings: {
              total: totalReviews,
              avg: averageRating
            },
            location: expert.location,
            skills: expert.skills,
            experience: expert.experience,
            session_fee: expert.hourlyRate,
            total_reviews: totalReviews,
            join_date: expert.user.createdAt
          },
          stats: {
            sessions: 0,
            students: studentCount.length,
            transactions: 0,
            cancelled: 0
          },
        },
      },
    });
  } catch (error) {
    console.error("Dashboard experts list error", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const changeStatus = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params?.id;
    if (!id) {
      return res.status(400).json({ success: false, message: "Please provide expert ID." });
    }

    const body = changeExpertStatus.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        success: false,
        message: "Invalid query parameters",
        errors: body.error.flatten().fieldErrors,
      });
      return
    }

    const { status } = body.data

    const expert = await prisma.expertProfile.update({
      where: { userId: id },
      data: {
        status
      }
    });

    if (!expert) {
      return res.status(404).json({ success: false, message: "Expert not found." });
    }

    return res.status(200).json({
      success: true,
      message: "Expert status changed successfully.",
      data: {
        expert: expert,
      },
    });
  } catch (error) {
    console.error("Getting error from change status", error?.message);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};
