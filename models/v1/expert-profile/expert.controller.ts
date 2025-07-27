import type { Response } from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import type { AuthenticatedRequest } from "../../../middleware/verifyUsers";
import moment from 'moment-timezone'
import { createZoomMeeting } from '../../../utils/zoom.utils'

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);


export const acceptRejectBooking = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id, action } = req.params; // action will be 'accept' or 'reject'
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

    let newStatus: "UPCOMING" | "REFUNDED";
    let message: string;

    if (action === 'accept') {
      newStatus = "UPCOMING";
      message = "Booking accepted successfully";
    } else {
      newStatus = "REFUNDED"; // Using REFUNDED status for cancelled bookings
      message = "Booking rejected successfully";
    }

    // Update the booking status
    const updatedBooking = await prisma.booking.update({
      where: { id: id },
      data: { status: newStatus },
    });

    // todo: send notification to the student that the booking is accepted and wait for the meeting link from the expert

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
        timezone: booking.expert?.timeZone || "UTC",
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
    const bookings = await prisma.booking.findMany({
      where: {
        expertId: expertId,
        status: "UPCOMING",
      },
      include: {
        student: true,
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
