import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default async function getDashboardStats() {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const [
        // total counts
        totalUsers,
        studentCount,
        expertCount,
        totalBookings,
        totalTransactions,

        // today's counts
        todayUsers,
        todayStudents,
        todayExperts,
        todayBookings,
        todayTransactions,
    ] = await Promise.all([
        prisma.users.count(),
        prisma.users.count({ where: { activeProfile: "STUDENT" } }),
        prisma.users.count({ where: { activeProfile: "EXPERT" } }),
        prisma.booking.count(),
        prisma.transaction.aggregate({
            where: { status: { in: ["COMPLETED"] } },
            _sum: { amount: true },
        }),

        prisma.users.count({
            where: { createdAt: { gte: startOfDay, lte: endOfDay } },
        }),
        prisma.users.count({
            where: {
                activeProfile: "STUDENT",
                createdAt: { gte: startOfDay, lte: endOfDay },
            },
        }),
        prisma.users.count({
            where: {
                activeProfile: "EXPERT",
                createdAt: { gte: startOfDay, lte: endOfDay },
            },
        }),
        prisma.booking.count({
            where: { createdAt: { gte: startOfDay, lte: endOfDay } },
        }),
        prisma.transaction.aggregate({
            where: {
                status: { in: ["COMPLETED"] },
                createdAt: { gte: startOfDay, lte: endOfDay },
            },
            _sum: { amount: true },
        }),
    ]);

    // Utility for percentage
    const percent = (today, total) => (total ? ((today / total) * 100).toFixed(2) : "0.00");

    const totalTransactionAmount = totalTransactions._sum.amount || 0;
    const todayTransactionAmount = todayTransactions._sum.amount || 0;

    const summary = {
        users: {
            total: totalUsers,
            today: todayUsers,
            percentage: percent(todayUsers, totalUsers),
        },
        students: {
            total: studentCount,
            today: todayStudents,
            percentage: percent(todayStudents, studentCount),
        },
        experts: {
            total: expertCount,
            today: todayExperts,
            percentage: percent(todayExperts, expertCount),
        },
        bookings: {
            total: totalBookings,
            today: todayBookings,
            percentage: percent(todayBookings, totalBookings),
        },
        transactions: {
            total: totalTransactionAmount,
            today: todayTransactionAmount,
            percentage: percent(todayTransactionAmount, totalTransactionAmount),
        },
    };

    return {
        expertCount,
        studentCount,
        summary,
        totalUsers,
    }
}