import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

import { createClient } from "redis";
import { httpServer } from "./app.js";

const PORT = process.env.PORT || 9000;

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
});

export { redisClient };

redisClient.on("error", (err) => console.log("Redis Client Error:", err));

(async () => {
  try {
    await redisClient.connect();
    console.log("Connected to Redis successfully");

    httpServer.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to connect to Redis:", err);
  }
})();