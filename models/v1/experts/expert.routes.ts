import { Router } from 'express';
import { acceptRejectBooking, createMeetingLink, expertSchedule, getExpertById, getExpertReviews, getExpertSkills, index, markSessionCompleted } from './expert.controller';
import { verifyUser } from '@/middleware/verifyUsers';

const router = Router();

router.get('/', verifyUser('ANY'), index)
router.get('/skills', verifyUser('ANY'), getExpertSkills)
router.get('/:id', verifyUser('ANY'), getExpertById)
router.get('/:id/reviews', verifyUser('ANY'), getExpertReviews)

router.get("/expert-schedule", verifyUser("EXPERT"), expertSchedule);

// Expert booking actions
router.post("/accept-reject-booking/:id/:action", verifyUser("EXPERT"), acceptRejectBooking);
router.post("/create-meeting-link/:bookingId", verifyUser("EXPERT"), createMeetingLink);
router.post("/complete-session/:id", verifyUser("EXPERT"), markSessionCompleted);


export default router;
