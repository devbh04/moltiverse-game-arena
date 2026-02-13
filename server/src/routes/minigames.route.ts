import { Router } from "express";
import * as controller from "../controllers/minigames.controller.js";

const router = Router();

// RPS
router.route("/rps").get(controller.getRPSGames).post(controller.createRPSGame);
router.route("/rps/:code").get(controller.getActiveRPSGame);

// TTT
router.route("/ttt").get(controller.getTTTGames).post(controller.createTTTGame);
router.route("/ttt/:code").get(controller.getActiveTTTGame);

export default router;
