import asyncHandler from "../utils/asyncHandler.js";
import { redisClient } from "../index.js";

const onlineUsers = asyncHandler(async (req, res) => {
  const users = await redisClient.hGetAll("onlineUsers");
  res.json(Object.values(users).map((user) => JSON.parse(user)));
});

const checkUsername = asyncHandler(async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ message: "Username is required" });
  }
  const existingUser = await redisClient.hGet("onlineUsers", username);
  if (!existingUser) {
    return res.status(200).json({ message: "Username is available" });
  }
  res.status(404).json({ message: "Username not found" });
});

export { onlineUsers, checkUsername };