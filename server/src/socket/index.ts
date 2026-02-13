import type { Socket } from "socket.io";

import { io } from "../server.js";
import {
    chat,
    claimAbandoned,
    getLatestGame,
    joinAsPlayer,
    joinLobby,
    leaveLobby,
    sendMove,
    resign,
    offerDraw,
    acceptDraw,
    declineDraw
} from "./game.socket.js";
import {
    rpsJoinLobby,
    rpsJoinAsPlayer,
    rpsPick,
    rpsEndSession,
    rpsContinueSession,
    rpsLeaveLobby
} from "./rps.socket.js";
import {
    tttJoinLobby,
    tttJoinAsPlayer,
    tttPlaceMove,
    tttEndSession,
    tttContinueSession,
    tttLeaveLobby
} from "./ttt.socket.js";

const socketConnect = (socket: Socket) => {
    const req = socket.request;

    socket.use((__, next) => {
        req.session.reload((err) => {
            if (err) {
                socket.disconnect();
            } else {
                next();
            }
        });
    });

    socket.on("disconnect", leaveLobby);

    // Chess
    socket.on("joinLobby", joinLobby);
    socket.on("leaveLobby", leaveLobby);
    socket.on("getLatestGame", getLatestGame);
    socket.on("sendMove", sendMove);
    socket.on("joinAsPlayer", joinAsPlayer);
    socket.on("chat", chat);
    socket.on("claimAbandoned", claimAbandoned);
    socket.on("resign", resign);
    socket.on("offerDraw", offerDraw);
    socket.on("acceptDraw", acceptDraw);
    socket.on("declineDraw", declineDraw);

    // RPS
    socket.on("rpsJoinLobby", rpsJoinLobby);
    socket.on("rpsJoinAsPlayer", rpsJoinAsPlayer);
    socket.on("rpsPick", rpsPick);
    socket.on("rpsEndSession", rpsEndSession);
    socket.on("rpsContinueSession", rpsContinueSession);
    socket.on("rpsLeaveLobby", rpsLeaveLobby);

    // TTT
    socket.on("tttJoinLobby", tttJoinLobby);
    socket.on("tttJoinAsPlayer", tttJoinAsPlayer);
    socket.on("tttPlaceMove", tttPlaceMove);
    socket.on("tttEndSession", tttEndSession);
    socket.on("tttContinueSession", tttContinueSession);
    socket.on("tttLeaveLobby", tttLeaveLobby);
};

export const init = () => {
    io.on("connection", socketConnect);
};

