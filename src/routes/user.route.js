import { Router } from "express";
import { onlineUsers } from "../controllers/user.controller.js";

const router = Router();

router.route("/onlineUsers").post(verifyJWT, onlineUsers);

export default router;
