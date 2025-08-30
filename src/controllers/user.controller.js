import asyncHandler from "../utils/asyncHandler.js";
import { redisClient } from "../index.js";

const onlineUsers = asyncHandler(async (req, res) => {
  const users = await redisClient.hGetAll("onlineUsers");
  res.json(Object.values(users).map((user) => JSON.parse(user)));
});

export { onlineUsers };