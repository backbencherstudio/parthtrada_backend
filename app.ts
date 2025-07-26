// app.ts
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import authRoutes from "./models/v1/auth/auth.routes";
import booking from "./models/v1/booking/booking.routes";
import chatRoutes from "./models/v1/chats/chats.routes";
import adminRoutes from "./models/v1/admin-dashboard/admin.routes";
import homeRoutes from "./models/v1/home/home.routes";

const app = express();

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

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan("dev"));

app.use("/auth", authRoutes);
app.use("/booking", booking);
app.use("/chat", chatRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/admin", adminRoutes);
app.use("/home", homeRoutes);

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