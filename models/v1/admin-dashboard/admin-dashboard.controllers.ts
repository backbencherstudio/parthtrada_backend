import { Request, Response } from "express";
import { PrismaClient, TransactionStatus } from "@prisma/client";

const prisma = new PrismaClient();

export const dashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const [totalUsers, studentCount, expertCount, totalSessions, txAgg] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { activeProfile: "STUDENT" } }),
      prisma.user.count({ where: { activeProfile: "EXPERT" } }),
      prisma.booking.count(),
      prisma.transaction.aggregate({
        where: { status: TransactionStatus.SUCCESS },
        _sum: { amount: true },
      }),
    ]);

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
    const latestUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: {
        name: true,
        activeProfile: true,
        email: true,
        createdAt: true,
      },
    });

    // Get latest 4 experts with details
    const latestExpertsRaw = await prisma.user.findMany({
      where: { activeProfile: "EXPERT" },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: {
        id: true,
        name: true,
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
        name: expert.name,
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
        totals: {
          totalUsers,
          totalExperts: expertCount,
          totalSessions,
          totalTransactions: txAgg._sum.amount ?? 0,
        },
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


export const dashboardUsersList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 10, search = '', role } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Build where clause
    let where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role && (role === 'STUDENT' || role === 'EXPERT')) {
      where.activeProfile = role;
    }

    const [totalUsers, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        where,
        select: {
          id: true,
          name: true,
          email: true,
          activeProfile: true,
          createdAt: true,
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        users,
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

export const dashboardExpertsList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 10, search = '', status, sortBy } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Build where clause
    let where: any = { activeProfile: 'EXPERT' };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Map status filter to BookingStatus
    let bookingStatus: any = undefined;
    if (status) {
      if (status === 'upcoming') bookingStatus = 'UPCOMING';
      else if (status === 'missed') bookingStatus = 'MISSED';
      else if (status === 'complete') bookingStatus = 'COMPLETED';
    }

    // If status filter is present, filter experts who have at least one booking with that status
    if (bookingStatus) {
      where.expertBookings = {
        some: { status: bookingStatus }
      };
    }

    const [totalExperts, expertsRaw] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' }, // fallback order
        where,
        select: {
          id: true,
          name: true,
          email: true,
          activeProfile: true,
          createdAt: true,
          expertProfile: { select: { hourlyRate: true } },
        },
      }),
    ]);

    // For each expert, get rating and total students
    const experts = await Promise.all(expertsRaw.map(async (expert) => {
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
        rating: ratingAgg._avg.rating ?? null,
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
        totalExperts,
        experts,
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


export const dashboardSessionsList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 10, search = '', status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Build where clause
    let where: any = {};
    // Status filter
    if (status) {
      if (status === 'upcoming') where.status = 'UPCOMING';
      else if (status === 'missed') where.status = 'MISSED';
      else if (status === 'completed') where.status = 'COMPLETED';
    }
    // Search filter (student or expert name)
    if (search) {
      where.OR = [
        { student: { name: { contains: search, mode: 'insensitive' } } },
        { expert: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [totalSessions, sessions] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        skip,
        take: Number(limit),
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
        totalSessions,
        sessions,
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

export const dashboardTransactionsList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 10, status, search = '' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Map status filter to BookingStatus
    let bookingStatusFilter: any = undefined;
    if (status) {
      if (status === 'pending') bookingStatusFilter = 'UPCOMING';
      else if (status === 'complete') bookingStatusFilter = 'COMPLETED';
      else if (status === 'refund') bookingStatusFilter = 'REFUNDED';
    }

    // Build where clause for transaction
    let where: any = {};
    if (bookingStatusFilter) {
      where.booking = { status: bookingStatusFilter };
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

    const [totalTransactions, transactions] = await Promise.all([
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
        totalTransactions,
        transactions: formattedTransactions,
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