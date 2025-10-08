import stripe from "@/services/stripe";
import { createZoomMeeting } from "@/utils/zoom.utils";
import { PrismaClient, Notification, Prisma } from "@prisma/client";
import moment from "moment-timezone";

const prisma = new PrismaClient()

type BookingWithRelations = Prisma.BookingGetPayload<{
    include: { expert: true, student: true };
}>;

export const accept_booking = async (booking: BookingWithRelations) => {

    const zoomMeeting = await createZoomMeeting({
        topic: `Session with ${booking.student.name || "Student"}`,
        startTime: booking.expertDateTime,
        duration: booking.sessionDuration,
        agenda: JSON.stringify(booking.sessionDetails),
        timezone: booking?.expert?.timezone ?? "UTC",
    });

    await prisma.notification.create({
        data: {
            type: "BOOKING_CONFIRMED",
            image: booking.expert.image,
            title: booking.expert.name,
            message: `Accepted your consultation request on ${moment.utc(booking.date).tz(booking.student.timezone)}`,
            sender_id: booking.expert.id,
            recipientId: booking.student.id,
            meta: {
                booking_id: booking.id,
                sessionDetails: null,
                disabled: true,
                texts: ["Decline", "Accepted"],
            },
        },
    });

    return {
        meeting_id: zoomMeeting.id,
        meeting_link: zoomMeeting.join_url,
        new_status: "UPCOMING",
        new_message: "Booking accepted successfully",
        updated_meta_texts: ["Decline", "Accepted"],
    };
};

export const cancel_booking = async (booking: BookingWithRelations) => {

    await prisma.notification.create({
        data: {
            type: 'BOOKING_CANCELLED_BY_EXPERT',
            image: booking.expert.image,
            title: booking.expert.name,
            message: `Reject your consultation request on ${moment.utc(booking.date).tz(booking.student.timezone)}`,
            sender_id: booking.expert.id,
            recipientId: booking.student.id,
            meta: {
                booking_id: booking.id,
                sessionDetails: null,
                disabled: true,
                texts: ['Declined', 'Accept'],
            },
        },
    });

    const transaction = await prisma.transaction.findUnique({
        where: {
            bookingId: booking.id
        },
        select: {
            id: true,
            amount: true,
            providerId: true,
        }
    })

    await stripe.refunds.create({
        payment_intent: transaction.providerId,
        amount: transaction.amount * 100,
        reverse_transfer: true,
        refund_application_fee: true,
        metadata: {
            type: 'BOOKING_CANCELLED_BY_EXPERT',
            booking_id: booking.id,
            transaction_id: transaction.id
        }
    })

    return {
        new_status: "CANCELLED",
        refund_reason: 'Cancelled The Meeting',
        new_message: "Booking rejected successfully",
        updated_meta_texts: ['Declined', 'Accept'],
    };
}

export const index = (notifications: Notification[]) => {
    return notifications.map(notification => {
        let booking_id: string | undefined
        let texts: string[]
        let disabled: boolean | undefined
        switch (notification.type) {
            case 'BOOKING_REQUESTED':
                const meta: any = notification?.meta
                booking_id = meta?.booking_id ?? ''
                texts = meta?.texts ?? []
                disabled = meta?.disabled ?? false
                return {
                    id: notification.sender_id,
                    img: notification.image,
                    title: notification.title,
                    description: notification.message,
                    actions: [
                        {
                            bg_primary: false,
                            text: texts[0] ?? null,
                            url: `/experts/bookings/actions/${booking_id}/reject/${notification.id}`,
                            req_method: 'PATCH',
                            disabled: disabled
                        },
                        {
                            bg_primary: true,
                            text: texts[1] ?? null,
                            url: `/experts/bookings/actions/${booking_id}/accept/${notification.id}`,
                            req_method: 'PATCH',
                            disabled: disabled
                        }
                    ],
                    meta: {
                        // @ts-ignore
                        sessionDetails: notification.meta?.sessionDetails ?? null
                    }
                }
            case 'BOOKING_CONFIRMED':
                // @ts-ignore
                booking_id = notification.meta?.booking_id as string
                return {
                    img: notification.image,
                    title: notification.title,
                    description: notification.message,
                    actions: []
                }
            case 'BOOKING_CANCELLED_BY_EXPERT':
                // @ts-ignore
                booking_id = notification.meta?.booking_id as string
                return {
                    img: notification.image,
                    title: notification.title,
                    description: notification.message,
                    actions: []
                }
            case 'REFUND_REVIEW':
                // @ts-ignore
                booking_id = notification.meta?.booking_id as string
                const m: any = notification?.meta
                return {
                    img: notification.image,
                    title: notification.title,
                    description: notification.message,
                    actions: [
                        {
                            bg_primary: true,
                            text: m.texts?.[0],
                            url: `/payments/bookings/${booking_id}/refunds/${notification.id}/review`,
                            req_method: 'POST',
                            disabled: m.texts?.[0] === 'Confirmed' ? true : false
                        }
                    ]
                }
            default:
                return notification
        }
    })
}
