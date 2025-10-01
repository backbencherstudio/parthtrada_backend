// app.ts
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import authRoutes from "./models/v1/auth/auth.routes";
import booking from "./models/v1/booking/booking.routes";
// import chatRoutes from "./models/v1/chats/chats.routes";
import dashboardRoutes from "./models/v1/dashboard/admin.routes";
import homeRoutes from "./models/v1/home/home.routes";
import expertRoutes from "./models/v1/experts/expert.routes";
import paymentRoutes from "./models/v1/payments/payment.routes";
import profileRoutes from "./models/v1/profile/profile.routes";
import reviewRoutes from "./models/v1/reviews/reviews.routes";
import conversationsRoutes from "./models/v1/conversations/conversations.routes";
import aiRoutes from "./models/v1/ai-assistant/ai.routes";
import s_webhookRoutes from './models/v1/stripe/webhook/webhook.routes'
import { setupIntent } from "./models/v1/booking/booking.controllers";
import bodyParser from "body-parser";

const app = express();

// app.use("/webhook", bodyParser.raw({ type: "application/json" }));

app.use(
  cors({
    origin: [
      "http://192.168.30.102:3000",
      "http://192.168.30.102:*",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003",
      "http://localhost:5174",
      "http://localhost:5173",
      "https://v0-fontend-development.vercel.app",
      "https://v0-hello-woad-pi.vercel.app",
    ],
  })
);

app.use("/stripe", s_webhookRoutes);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan("dev"));

app.use("/auth", authRoutes);
app.use("/profile", profileRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/bookings", booking);
// app.use("/chat", chatRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/home", homeRoutes);
app.use("/experts", expertRoutes);
app.use("/payments", paymentRoutes);
app.use("/reviews", reviewRoutes);
app.use("/conversations", conversationsRoutes);
app.use("/ai", aiRoutes);

// For testing add ejs
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.get("/add-card", async (req, res) => {
  try {
    const intent = await setupIntent()

    res.render("index", {
      publishableKey: 'pk_test_51S39GcLenvrEQJkbVfvGzHLbGEVeTgpoJFGv6ZMw5vvai6r2HQrusGhuSRaBASSDlUc9Y1R293qKduPfhqPKwtEw00PRFjI7Xa',
      clientSecret: intent.clientSecret,
      customerId: intent.customerId
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to create SetupIntent");
  }
});

app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({
    message: `404 route not found`,
  });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({
    message: `500 Something broken!`,
    error: err.message,
  });
});

// app.use(express.static(path.join(__dirname, "public")));

export default app;