import { Router } from "express";
import {
  onlineUsers,
  checkUsername,
  getRequests,
} from "../controllers/user.controller.js";

const router = Router();

router.route("/onlineUsers").get(onlineUsers);
router.route("/checkUsername").post(checkUsername);
router.route("/requests").post(getRequests);

export default router;
