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