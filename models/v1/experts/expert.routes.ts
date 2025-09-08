import { Router } from 'express';
import { verifyUser } from '../../../middleware/verifyUsers';
import { acceptRejectBooking, createMeetingLink, expertSchedule, index, markSessionCompleted } from './expert.controller';


const router = Router();


router.get('/', index)
router.get("/expert-schedule", verifyUser("EXPERT"), expertSchedule);

// Expert booking actions
router.post("/accept-reject-booking/:id/:action", verifyUser("EXPERT"), acceptRejectBooking);
router.post("/create-meeting-link/:bookingId", verifyUser("EXPERT"), createMeetingLink);
router.post("/complete-session/:id", verifyUser("EXPERT"), markSessionCompleted);


export default router;