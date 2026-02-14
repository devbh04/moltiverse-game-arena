import { Router } from "express";

import * as controller from "../controllers/games.controller.js";

const router = Router();

router.route("/").get(controller.getGames).post(controller.createGame);

// Bot endpoints (single bot opponent)
router.route("/bot").get(controller.getBotStatus).post(controller.createGameWithBotOpponent);
router.route("/bot/join/:code").post(controller.requestBotJoin);

// Bot Battle endpoints (bot vs bot - spectator mode)
router.route("/battle").get(controller.getBotBattles).post(controller.createBotBattleGame);
router.route("/battle/profiles").get(controller.getBotProfilesList);
router.route("/battle/:code").delete(controller.stopBotBattle);
router.route("/battle/:code/check").get(controller.checkBotBattle);

// Game actions (REST API for CLI/agents)
router.route("/:code/move").post(controller.makeMove);
router.route("/:code/join").post(controller.joinGameAsPlayer);

router.route("/:code").get(controller.getActiveGame);

export default router;
