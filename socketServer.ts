// socket-server.ts
import { Server } from "socket.io";
import { createServer } from "http";
import app from "./app";

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
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
    methods: ["GET", "POST"],
    credentials: true
  },
});

const connectedUsers = new Map();

io.on("connection", (socket) => {
  // Handle user connection with error handling
  socket.on("user_connected", async (userId) => {
    try {
      if (!userId) {
        socket.emit("error", { message: "User ID is required" });
        return;
      }
      connectedUsers.set(userId, socket.id);
      io.emit("user_status", { userId, status: "online" });
    } catch (error) {
      console.error("Error in user_connected:", error);
      socket.emit("error", { message: "Failed to connect user" });
    }
  });

  socket.on("typing", ({ roomId, userId, isTyping }) => {
    try {
      if (!roomId || !userId) {
        socket.emit("error", { message: "Room ID and User ID are required" });
        return;
      }
      socket.to(roomId).emit("user_typing", { userId, isTyping });
    } catch (error) {
      console.error("Error in typing event:", error);
      socket.emit("error", { message: "Failed to process typing event" });
    }
  });

  socket.on("send_message", async (messageData) => {
    try {
      const { roomId, senderId, content } = messageData;
      if (!roomId || !senderId || !content) {
        socket.emit("error", { message: "Invalid message data" });
        return;
      }
      io.to(roomId).emit("new_message", messageData);
    } catch (error) {
      console.error("Error in send_message:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  socket.on("message_seen", ({ messageId, roomId }) => {
    try {
      if (!messageId || !roomId) {
        socket.emit("error", { message: "Message ID and Room ID are required" });
        return;
      }
      io.to(roomId).emit("message_status", { messageId, status: "seen" });
    } catch (error) {
      console.error("Error in message_seen:", error);
      socket.emit("error", { message: "Failed to mark message as seen" });
    }
  });

  socket.on("disconnect", () => {
    try {
      let userId;
      for (const [key, value] of connectedUsers.entries()) {
        if (value === socket.id) {
          userId = key;
          break;
        }
      }
      if (userId) {
        connectedUsers.delete(userId);
        io.emit("user_status", { userId, status: "offline" });
      }
    } catch (error) {
      console.error("Error in disconnect:", error);
    }
  });
});

export { httpServer, io };