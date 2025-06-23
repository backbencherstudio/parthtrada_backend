// import { Router } from 'express';
// import { verifyUser } from '../../../middleware/verifyUsers';
// import { getAvailableExperts, createBooking, confirmPayment, getMyBookings, cancelBooking } from "./booking.controllers"

// const router = Router();

// router.get("/experts/available", getAvailableExperts)

// router.post("/create", verifyUser("STUDENT"), createBooking)

// router.post("/confirm-payment", confirmPayment)

// router.get("/my-bookings", verifyUser("ANY"), getMyBookings)

// router.put("/cancel/:bookingId", verifyUser("ANY"), cancelBooking)



// export default router;










import { Router } from 'express';
import { verifyUser } from '../../../middleware/verifyUsers';
import { createBooking, confirmPayment } from "./booking.controllers";

const router = Router();

router.post("/create", verifyUser("STUDENT"), createBooking);
router.post("/confirm-payment", confirmPayment);

export default router;