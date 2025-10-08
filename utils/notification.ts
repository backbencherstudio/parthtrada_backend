import { createZoomMeeting } from "@/utils/zoom.utils";
import { Moment } from "moment-timezone";

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
