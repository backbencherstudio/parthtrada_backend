import { createZoomMeeting } from "@/utils/zoom.utils";
import { PrismaClient, Notification } from "@prisma/client";
import { Moment } from "moment-timezone";

const prisma = new PrismaClient()

type AcceptBookingRequest = {
    student: {
        name: string;
        timezone: Moment;
    };
    booking: {
        expertDateTime: Date;
        sessionDuration: number;
        agenda: string;
        expert: {
            timezone: string;
        };
    };
};

type RejectBookingRequest = {
    booking_id: string
    sender_id: string
    recipient_id: string
    expert: {
        image: string
        name: string
    }
    student: {
        timezone: Moment
    }
}

export const accept_booking = async (data: AcceptBookingRequest) => {
    const {
        student,
        booking: { expertDateTime, sessionDuration, agenda, expert },
    } = data;

    const zoomMeeting = await createZoomMeeting({
        topic: `Session with ${student.name || "Student"}`,
        startTime: expertDateTime,
        duration: sessionDuration,
        agenda,
        timezone: expert?.timezone ?? "UTC",
    });

    return {
        meeting_id: zoomMeeting.id,
        meeting_link: zoomMeeting.join_url,
        new_status: "UPCOMING",
        new_message: "Booking accepted successfully",
        updated_meta_texts: ["Decline", "Accepted"],
        new_notification_type: "BOOKING_CONFIRMED" as const,
        new_notification_message: `Accepted your consultation request on ${student.timezone}`,
    };
};

export const cancel_booking = async (data: RejectBookingRequest) => {

    await prisma.notification.create({
        data: {
            type: 'REFUND_REVIEW',
            image: data.expert.image,
            title: data.expert.name,
            message: 'Expert marked the refund as sent. Dit it reach you?',
            sender_id: data.sender_id,
            recipientId: data.recipient_id,
            meta: {
                booking_id: data.booking_id,
                sessionDetails: null,
                disabled: false,
                texts: ['Confirm Received'],
            }
        }
    })

    return {
        new_status: "CANCELLED",
        refund_reason: 'Cancelled The Meeting',
        new_message: "Booking rejected successfully",
        updated_meta_texts: ['Declined', 'Accept'],
        new_notification_type: 'BOOKING_CANCELLED_BY_EXPERT' as const,
        new_notification_message: `Reject your consultation request on ${data.student.timezone}`,
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
                    actions: [
                        {
                            bg_primary: true,
                            text: 'Refund',
                            url: `refund_req`,
                            req_method: 'POST'
                        }
                    ]
                }
            default:
                return notification
        }
    })
}
