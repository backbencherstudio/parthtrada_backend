// import { PrismaClient } from "@prisma/client";
// import { httpServer } from "./socketServer";
// import app from "./app";

// const PORT = process.env.PORT || 8000;

// const prisma = new PrismaClient();


// httpServer.listen(PORT, async () => {
//   try {
//     console.log(`Server running on http://localhost:${PORT}`);
//     console.log(`WebSocket available at ws://localhost:${PORT}`);
//     await prisma.$connect();
//     console.log("Database connected...");
//   } catch (err) {
//     console.error("Database connection error:", err);
//   }
// });


import { PrismaClient } from "@prisma/client";
import { httpServer } from "./socketServer";
import app from "./app";

const PORT = process.env.PORT || 8000;
const prisma = new PrismaClient();


httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}`);
 
  prisma.$connect()
    .then(() => console.log("Database connected..."))
    .catch((err) => console.error("Database connection error:", err));
});
 
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});