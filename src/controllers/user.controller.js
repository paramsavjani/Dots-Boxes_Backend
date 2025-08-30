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
  const onlineUsers = await redisClient.hGetAll("onlineUsers");
  const existingUser = Object.values(onlineUsers).filter((userStr) => {
    const user = JSON.parse(userStr);
    return user.username === username;
  });
  if (existingUser.length === 0) {
    return res.status(200).json({ message: "Username is available" });
  }
  res.status(404).json({ message: "Username is already taken" });
});

export { onlineUsers, checkUsername };
