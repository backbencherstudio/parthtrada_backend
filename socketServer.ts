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
  },
});

const connectedUsers = new Map();

io.on("connection", (socket) => {
  // Handle user connection
  socket.on("user_connected", async (userId) => {
    connectedUsers.set(userId, socket.id);
    io.emit("user_status", { userId, status: "online" });
  });

  socket.on("typing", ({ roomId, userId, isTyping }) => {
    socket.to(roomId).emit("user_typing", { userId, isTyping });
  });

  socket.on("send_message", async (messageData) => {
    const { roomId, senderId, content } = messageData;
    io.to(roomId).emit("new_message", messageData);
  });

  socket.on("message_seen", ({ messageId, roomId }) => {
    io.to(roomId).emit("message_status", { messageId, status: "seen" });
  });

  socket.on("disconnect", () => {
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
  });
});

export { httpServer, io };