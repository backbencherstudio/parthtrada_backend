import type { Request, Response } from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import moment from 'moment-timezone'
import { AuthenticatedRequest } from "@/middleware/verifyUsers";
import { createZoomMeeting } from "@/utils/zoom.utils";
import { expertScheduleQuerySchema, expertsQuerySchema } from "@/utils/queryValidation";
import { accept_booking, cancel_booking } from "@/utils/notification";

const prisma = new PrismaClient();

export const index = async (req: Request, res: Response) => {
  try {
    const result = expertsQuerySchema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        success: false,
        message: "Invalid query parameters",
        errors: result.error.flatten().fieldErrors,
      });
      return
    }

    const { page, perPage, name } = result.data;
    const skip = (page - 1) * perPage;

    const where: Prisma.ExpertProfileWhereInput = {
      ...(name
        ? {
          user: {
            name: {
              contains: name,
              mode: "insensitive",
            },
          },
        }
        : {}),
    };

    if (result.data.skills) {
      const skillsArray = (result.data.skills as string)
        .split(',')
        .map(s => s.trim())
        .filter(s => s);
      where.skills = { hasSome: skillsArray, };
    }

    const andConditions: Prisma.ExpertProfileWhereInput[] = [];

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const total = await prisma.expertProfile.count({ where });
    const data = await prisma.expertProfile.findMany({
      where,
      skip,
      include: { user: { select: { name: true, email: true, image: true } } }
    });

    const expertIds = data.map(expert => expert.userId);
    const ratings = await prisma.review.groupBy({
      by: ['expertId'],
      where: { expertId: { in: expertIds } },
      _avg: { rating: true },
      _count: { rating: true }
    });

    const ratingsMap = Object.fromEntries(
      ratings.map(r => [r.expertId, { avg: r._avg.rating, total: r._count.rating }])
    );

    const dataWithRatings = data.map(expert => ({
      ...expert,
      rating: ratingsMap[expert.userId] ?? { avg: 0, total: 0 }
    }));

    res.status(200).json({
      success: true,
      message: 'Experts fetched successfully.',
      data: dataWithRatings,
      pagination: {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
        hasNextPage: page * perPage < total,
        hasPrevPage: page > 1,
      },
    })
  } catch (error) {
    console.error('Error getting experts:', error?.message)
    res.status(500).json({
      success: false,
      message: "Failed to get experts.",
      error: error instanceof Error ? error.message : "Internal server error",
    });
    return
  }
}

export const getExpertById = async (req: Request, res: Response) => {
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
          },
        },
      },
    });

    if (!expert) {
      return res.status(404).json({ success: false, message: "Expert not found." });
    }

    // Aggregate review stats directly from Review model
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

    const ratingDistribution = Object.entries(ratingCounts)
      .map(([rating, count]) => ({
        rating: Number(rating),
        count,
        percentage: totalReviews > 0 ? ((count / totalReviews)).toFixed(2) : "0.00",
      }))
      .reverse();

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

    const totalStudents = studentCount.length;

    return res.status(200).json({
      success: true,
      message: "Expert fetched successfully.",
      data: {
        expert: {
          id: expert.id,
          profession: expert.profession,
          organization: expert.organization,
          location: expert.location,
          description: expert.description,
          experience: expert.experience,
          hourlyRate: expert.hourlyRate,
          skills: expert.skills,
          availableDays: expert.availableDays,
          availableTime: expert.availableTime,
          user: expert.user,
        },
        stats: {
          totalReviews,
          averageRating,
          ratingDistribution,
          totalStudents,
        },
      },
    });
  } catch (error) {
    console.error("Error getting expert:", error?.message);
    return res.status(500).json({
      success: false,
      message: "Failed to get expert.",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const getExpertReviews = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params?.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 5;

    if (!id) {
      return res.status(400).json({ success: false, message: "Please provide expert ID." });
    }

    const [totalReviews, reviews] = await Promise.all([
      prisma.review.count(),
      prisma.review.findMany({
        where: {},
        include: {
          student: { select: { name: true, email: true, image: true } },
          booking: { select: { date: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Reviews fetched successfully.",
      data: {
        page,
        limit,
        total: totalReviews,
        items: reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          description: r.description,
          createdAt: r.createdAt,
          student: r.student,
          sessionDate: r.booking?.date,
        })),
      },
    });
  } catch (error) {
    console.error("Error getting reviews:", error?.message);
    return res.status(500).json({
      success: false,
      message: "Failed to get reviews.",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const getExpertSkills = async (req: AuthenticatedRequest, res: Response) => {
  try {
    function normalizeSkill(skill: string) {
      return skill
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/s$/, '');
    }

    const experts = await prisma.expertProfile.findMany({
      select: { skills: true }
    });

    const normalizedMap = new Map<string, string>();

    for (const skill of experts.flatMap(e => e.skills)) {
      const key = normalizeSkill(skill);
      if (!normalizedMap.has(key)) {
        normalizedMap.set(key, skill.trim());
      }
    }

    const uniqueSkills = Array.from(normalizedMap.values());

    res.json({
      success: true,
      message: "Skills fetched successfully.",
      data: uniqueSkills,
    });
    return
  } catch (error) {
    console.error("Error getting skills:", error?.message);
    res.status(500).json({
      success: false,
      message: "Failed to get skills.",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const getReviews = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reviews = await prisma.review.findMany({
      select: {
        id: true,
        rating: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        student: {
          select: {
            id: true,
            name: true,
            image: true,
            studentProfile: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    res.json({
      success: true,
      message: "Reviews fetched successfully.",
      data: reviews,
    });
  } catch (error) {
    console.error("Error getting reviews:", error?.message);
    res.status(500).json({
      success: false,
      message: "Failed to get reviews.",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};


export const acceptRejectBooking = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id, action, notification_id } = req.params;
    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({ message: "Invalid action" });
    }
    const expertId = req.user?.id;

    if (!id || !action) {
      res.status(400).json({
        success: false,
        message: "Booking ID and action are required",
      });
      return;
    }

    if (!expertId) {
      res.status(401).json({
        success: false,
        message: "Expert not authenticated",
      });
      return;
    }

    // Validate action parameter
    if (action !== 'accept' && action !== 'reject') {
      res.status(400).json({
        success: false,
        message: "Action must be 'accept' or 'reject'",
      });
      return;
    }

    // Find the meeting request and verify it belongs to this expert
    const booking = await prisma.booking.findUnique({
      where: { id: id },
      include: {
        student: true,
        expert: true,
      },
    });

    if (!booking) {
      res.status(404).json({
        success: false,
        message: "Meeting request not found",
      });
      return;
    }

    if (booking.expertId !== expertId) {
      res.status(403).json({
        success: false,
        message: "You are not authorized to modify this request",
      });
      return;
    }

    if (booking.status !== "PENDING" || booking.meetingLink) {
      res.status(400).json({
        success: false,
        message: `This booking has already been processed`,
      });
      return;
    }

    let newStatus, meetingID, meetingLink, message, refund_reason;
    let updatedMetaTexts = [];

    if (action === 'accept') {
      const {
        meeting_id,
        meeting_link,
        new_message,
        new_status,
        updated_meta_texts,
      } = await accept_booking(booking);

      meetingID = meeting_id;
      meetingLink = meeting_link;
      newStatus = new_status;
      message = new_message;
      updatedMetaTexts = updated_meta_texts;
    } else {
      const { new_message, new_status, refund_reason: RefundReason, updated_meta_texts } = await cancel_booking(booking)

      newStatus = new_status;
      refund_reason = RefundReason;
      message = new_message;

      updatedMetaTexts = updated_meta_texts;
    }

    // Common: update the original notification
    const notification = await prisma.notification.findUnique({
      where: { id: notification_id },
      select: { meta: true },
    });

    if (!notification) throw new Error("Notification not found");

    const currentMeta = (notification.meta && typeof notification.meta === 'object')
      ? notification.meta
      : {};

    const payload = {
      ...currentMeta,
      disabled: true,
      texts: updatedMetaTexts,
    }

    await prisma.notification.update({
      where: { id: notification_id },
      data: {
        meta: payload,
      },
    });


    // Update the booking status
    await prisma.booking.update({
      where: { id: id },
      data: { status: newStatus, refund_reason: refund_reason ?? null, meetingLink, meetingID: meetingID },
    });

    res.status(200).json({
      success: true,
      message: message,
    });
  } catch (error) {
    console.error("Error processing booking:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process booking request",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const markSessionCompleted = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // booking ID
    const userId = req.user?.id;

    if (!id) {
      res.status(400).json({
        success: false,
        message: "Booking ID is required",
      });
      return;
    }

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Find the booking and verify user has access to it
    const booking = await prisma.booking.findUnique({
      where: { id: id },
      include: {
        student: true,
        expert: true,
      },
    });

    if (!booking) {
      res.status(404).json({
        success: false,
        message: "Booking not found",
      });
      return;
    }

    // Allow both student and expert to mark as completed
    if (booking.studentId !== userId && booking.expertId !== userId) {
      res.status(403).json({
        success: false,
        message: "You are not authorized to update this booking",
      });
      return;
    }

    // Check if booking is in correct status to be completed
    if (booking.status !== "UPCOMING") {
      res.status(400).json({
        success: false,
        message: `Cannot complete booking with status: ${booking.status}`,
      });
      return;
    }

    // Update the booking status to completed
    const updatedBooking = await prisma.booking.update({
      where: { id: id },
      data: { status: "COMPLETED" },
    });

    res.status(200).json({
      success: true,
      message: "Session marked as completed successfully",
      data: updatedBooking,
    });
  } catch (error) {
    console.error("Error marking session as completed:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark session as completed",
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const createMeetingLink = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { bookingId } = req.params;
    const expertId = req.user?.id;

    // get the booking details
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        student: true,
        expert: true,
      },
    });
    if (!booking) {
      res.status(404).json({
        success: false,
        message: "Booking not found",
      });
      return;
    }
    // check if the booking meeting link is already created
    if (booking.meetingLink) {
      res.status(200).json({
        success: false,
        message: "Meeting link already created",
      });
      return;
    }
    // 1️⃣ Create Zoom meeting scheduled in expert's timezone
    let meetingLink: string | undefined;
    try {
      const zoomMeeting = await createZoomMeeting({
        topic: `Session with ${booking.student?.name ?? 'Student'}`,
        startTime: booking.date,
        duration: booking.sessionDuration, // expecting minutes
        agenda: booking.sessionDetails as string,
        timezone: booking.expert?.timezone || "UTC",
      });
      // console.log("meetingLink", zoomMeeting)
      meetingLink = zoomMeeting.join_url;
    } catch (zoomErr) {
      // console.error('Failed to create Zoom meeting', zoomErr);
      // If Zoom creation fails, we can choose to proceed without it or abort. Here we abort.
      res.status(500).json({
        success: false,
        message: 'Failed to create Zoom meeting',
      });
      return;
    }

    // todo: send notification to the student that the meeting link is created

    // update the booking with the meeting link
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: { meetingLink: meetingLink },
    });
    res.status(200).json({
      success: true,
      message: "Meeting link created successfully",
      data: updatedBooking,
    });
  } catch (error) {
    console.error("Error creating meeting link:", error);
  }
};

export const expertSchedule = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const expertId = req.user?.id;
    // get all the upcoming bookings for the expert

    const result = expertScheduleQuerySchema.safeParse(req.query);
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

    const where: Prisma.BookingWhereInput = {
      expertId: expertId,
      status: 'UPCOMING'
    }

    const total = await prisma.booking.count({
      where,
    });
    const bookings = await prisma.booking.findMany({
      where,
      skip,
      include: {
        student: true,
      },
    });
    res.status(200).json({
      success: true,
      message: "Schedule fetched successfully",
      data: bookings,
      pagination: {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
        hasNextPage: page * perPage < total,
        hasPrevPage: page > 1,
      },
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
