#!/usr/bin/env node
/**
 * MCP Server for Moltiverse Chess Game
 * Allows OpenClaw agents to play chess through the game server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Chess } from "chess.js";
import { io } from "socket.io-client";

const API_URL = process.env.GAME_API_URL || "http://localhost:3001";

// State management
let sessionCookie = null;
let currentGame = null;
let socket = null;
let chess = new Chess();
let agentSide = null; // 'w' or 'b'

// Helper to make authenticated requests
async function apiRequest(endpoint, method = "GET", body = null) {
    const headers = {
        "Content-Type": "application/json"
    };
    if (sessionCookie) {
        headers["Cookie"] = sessionCookie;
    }

    const options = {
        method,
        headers,
        credentials: "include"
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_URL}${endpoint}`, options);
    
    // Capture session cookie
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
        sessionCookie = setCookie.split(";")[0];
    }

    if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
}

// Socket connection management
function connectSocket(gameCode) {
    return new Promise((resolve, reject) => {
        if (socket) {
            socket.disconnect();
        }

        socket = io(API_URL, {
            withCredentials: true,
            extraHeaders: sessionCookie ? { Cookie: sessionCookie } : {},
            transports: ["websocket", "polling"]
        });

        socket.on("connect", () => {
            console.error(`[MCP] Socket connected, joining game ${gameCode}`);
            socket.emit("joinLobby", gameCode);
        });

        socket.on("receivedLatestGame", (game) => {
            currentGame = game;
            if (game.pgn) {
                chess.loadPgn(game.pgn);
            } else {
                chess.reset();
            }
            
            // Determine our side
            if (game.white?.name?.includes("Moltbot") || game.white?.id === "moltbot-mcp") {
                agentSide = "w";
            } else if (game.black?.name?.includes("Moltbot") || game.black?.id === "moltbot-mcp") {
                agentSide = "b";
            }
            
            resolve(game);
        });

        socket.on("receivedMove", (move) => {
            chess.move(move);
            console.error(`[MCP] Received move: ${move.from}-${move.to}`);
        });

        socket.on("userJoinedAsPlayer", (data) => {
            console.error(`[MCP] Player joined: ${data.name} as ${data.side}`);
        });

        socket.on("gameOver", (data) => {
            console.error(`[MCP] Game over: ${data.reason}, winner: ${data.winnerName || "draw"}`);
        });

        socket.on("connect_error", (err) => {
            console.error(`[MCP] Socket connection error: ${err.message}`);
            reject(err);
        });

        setTimeout(() => {
            if (!currentGame) {
                reject(new Error("Timeout waiting for game state"));
            }
        }, 10000);
    });
}

// Create MCP Server
const server = new McpServer({
    name: "moltiverse-chess",
    version: "1.0.0"
});

// Tool: Authenticate as guest
server.tool(
    "auth_guest",
    "Authenticate as a guest player with a display name",
    { name: z.string().describe("Display name for the guest player") },
    async ({ name }) => {
        try {
            const result = await apiRequest("/v1/auth/guest", "POST", { name });
            return {
                content: [{
                    type: "text",
                    text: `✅ Authenticated as guest: ${name}\nSession established successfully.`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `❌ Authentication failed: ${error.message}`
                }],
                isError: true
            };
        }
    }
);

// Tool: Create a new chess game
server.tool(
    "create_game",
    "Create a new chess game and wait for an opponent",
    { 
        side: z.enum(["white", "black", "random"]).describe("Which side to play as")
    },
    async ({ side }) => {
        try {
            if (!sessionCookie) {
                return {
                    content: [{
                        type: "text",
                        text: "❌ Not authenticated. Call auth_guest first."
                    }],
                    isError: true
                };
            }

            const result = await apiRequest("/v1/games", "POST", { side });
            chess.reset();
            
            // Connect via WebSocket
            await connectSocket(result.code);
            
            return {
                content: [{
                    type: "text",
                    text: `✅ Game created!\nCode: ${result.code}\nYour side: ${side}\nWaiting for opponent to join...\nShare this code or URL: http://localhost:3000/${result.code}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `❌ Failed to create game: ${error.message}`
                }],
                isError: true
            };
        }
    }
);

// Tool: Join an existing game
server.tool(
    "join_game",
    "Join an existing chess game by code",
    { 
        code: z.string().describe("The 6-character game code")
    },
    async ({ code }) => {
        try {
            if (!sessionCookie) {
                return {
                    content: [{
                        type: "text",
                        text: "❌ Not authenticated. Call auth_guest first."
                    }],
                    isError: true
                };
            }

            // First get game info
            const gameInfo = await apiRequest(`/v1/games/${code}`);
            
            // Connect via WebSocket
            await connectSocket(code);
            
            // Join as player if spot available
            if (!currentGame.white || !currentGame.black) {
                socket.emit("joinAsPlayer");
            }

            const myColor = currentGame.white?.name?.includes("Moltbot") ? "white" : 
                           currentGame.black?.name?.includes("Moltbot") ? "black" : "spectator";
            
            return {
                content: [{
                    type: "text",
                    text: `✅ Joined game ${code}\nWhite: ${currentGame.white?.name || "waiting"}\nBlack: ${currentGame.black?.name || "waiting"}\nYou are: ${myColor}\nCurrent position:\n${chess.ascii()}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `❌ Failed to join game: ${error.message}`
                }],
                isError: true
            };
        }
    }
);

// Tool: Get current game state
server.tool(
    "get_game_state",
    "Get the current state of the chess game including board position and whose turn it is",
    {},
    async () => {
        try {
            if (!currentGame) {
                return {
                    content: [{
                        type: "text",
                        text: "❌ No active game. Create or join a game first."
                    }],
                    isError: true
                };
            }

            const turn = chess.turn() === "w" ? "White" : "Black";
            const isMyTurn = chess.turn() === agentSide;
            const status = chess.isGameOver() 
                ? (chess.isCheckmate() ? "Checkmate!" : chess.isDraw() ? "Draw" : "Game Over")
                : chess.isCheck() ? "Check!" : "In progress";

            return {
                content: [{
                    type: "text",
                    text: `📋 Game State (${currentGame.code})
White: ${currentGame.white?.name || "waiting"}
Black: ${currentGame.black?.name || "waiting"}
Turn: ${turn} ${isMyTurn ? "(YOUR TURN)" : "(opponent's turn)"}
Status: ${status}
Move count: ${chess.history().length}

Position:
${chess.ascii()}

FEN: ${chess.fen()}
${chess.history().length > 0 ? `Last moves: ${chess.history().slice(-5).join(", ")}` : ""}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `❌ Error getting game state: ${error.message}`
                }],
                isError: true
            };
        }
    }
);

// Tool: Get legal moves
server.tool(
    "get_legal_moves",
    "Get all legal moves in the current position, optionally for a specific piece",
    {
        square: z.string().optional().describe("Specific square to get moves for (e.g., 'e2')")
    },
    async ({ square }) => {
        try {
            if (!currentGame) {
                return {
                    content: [{
                        type: "text",
                        text: "❌ No active game."
                    }],
                    isError: true
                };
            }

            let moves;
            if (square) {
                moves = chess.moves({ square, verbose: true });
            } else {
                moves = chess.moves({ verbose: true });
            }

            if (moves.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: square 
                            ? `No legal moves from ${square}` 
                            : "No legal moves available (game may be over)"
                    }]
                };
            }

            // Group moves by piece
            const movesByPiece = {};
            moves.forEach(m => {
                const key = `${m.piece.toUpperCase()} on ${m.from}`;
                if (!movesByPiece[key]) movesByPiece[key] = [];
                movesByPiece[key].push(`${m.to}${m.promotion ? "=" + m.promotion.toUpperCase() : ""}${m.captured ? " (captures " + m.captured + ")" : ""}`);
            });

            let output = `♟️ Legal Moves (${moves.length} total):\n\n`;
            for (const [piece, targets] of Object.entries(movesByPiece)) {
                output += `${piece}: ${targets.join(", ")}\n`;
            }

            // Highlight captures and checks
            const captures = moves.filter(m => m.captured);
            const checks = moves.filter(m => {
                chess.move(m);
                const isCheck = chess.isCheck();
                chess.undo();
                return isCheck;
            });

            if (captures.length > 0) {
                output += `\n⚔️ Captures available: ${captures.map(m => m.san).join(", ")}`;
            }
            if (checks.length > 0) {
                output += `\n👑 Checking moves: ${checks.map(m => m.san).join(", ")}`;
            }

            return {
                content: [{
                    type: "text",
                    text: output
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `❌ Error getting moves: ${error.message}`
                }],
                isError: true
            };
        }
    }
);

// Tool: Make a move
server.tool(
    "make_move",
    "Make a chess move. Use algebraic notation (e.g., 'e4', 'Nf3', 'O-O') or coordinate notation (e.g., 'e2e4')",
    {
        move: z.string().describe("The move in algebraic notation (e.g., 'e4', 'Nf3', 'Bxc6', 'O-O') or coordinates (e.g., 'e2e4')")
    },
    async ({ move }) => {
        try {
            if (!currentGame) {
                return {
                    content: [{
                        type: "text",
                        text: "❌ No active game."
                    }],
                    isError: true
                };
            }

            if (!socket?.connected) {
                return {
                    content: [{
                        type: "text",
                        text: "❌ Not connected to game server."
                    }],
                    isError: true
                };
            }

            // Check if it's our turn
            if (agentSide && chess.turn() !== agentSide) {
                return {
                    content: [{
                        type: "text",
                        text: `❌ It's not your turn! Current turn: ${chess.turn() === "w" ? "White" : "Black"}`
                    }],
                    isError: true
                };
            }

            // Parse the move
            let moveObj;
            if (move.length === 4 || move.length === 5) {
                // Coordinate notation: e2e4 or e7e8q
                moveObj = {
                    from: move.slice(0, 2),
                    to: move.slice(2, 4),
                    promotion: move.length === 5 ? move[4] : undefined
                };
            } else {
                // Algebraic notation
                const validMove = chess.move(move);
                if (!validMove) {
                    return {
                        content: [{
                            type: "text",
                            text: `❌ Invalid move: ${move}`
                        }],
                        isError: true
                    };
                }
                chess.undo(); // We'll let the server validate
                moveObj = {
                    from: validMove.from,
                    to: validMove.to,
                    promotion: validMove.promotion
                };
            }

            // Send move to server
            socket.emit("sendMove", moveObj);
            
            // Apply locally
            const result = chess.move(moveObj);
            
            if (!result) {
                return {
                    content: [{
                        type: "text",
                        text: `❌ Invalid move: ${move}`
                    }],
                    isError: true
                };
            }

            let statusMsg = "";
            if (chess.isCheckmate()) {
                statusMsg = "🏆 CHECKMATE! You win!";
            } else if (chess.isDraw()) {
                statusMsg = "🤝 Draw!";
            } else if (chess.isCheck()) {
                statusMsg = "♚ Check!";
            }

            return {
                content: [{
                    type: "text",
                    text: `✅ Move played: ${result.san}
${statusMsg}

Position after move:
${chess.ascii()}

${chess.turn() === agentSide ? "It's your turn again!" : "Waiting for opponent's move..."}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `❌ Error making move: ${error.message}`
                }],
                isError: true
            };
        }
    }
);

// Tool: Analyze position
server.tool(
    "analyze_position",
    "Get a strategic analysis of the current position to help decide on a move",
    {},
    async () => {
        try {
            if (!currentGame) {
                return {
                    content: [{
                        type: "text",
                        text: "❌ No active game."
                    }],
                    isError: true
                };
            }

            const moves = chess.moves({ verbose: true });
            
            // Categorize moves
            const captures = moves.filter(m => m.captured);
            const checks = moves.filter(m => {
                chess.move(m);
                const isCheck = chess.isCheck();
                chess.undo();
                return isCheck;
            });
            const centerMoves = moves.filter(m => ["d4", "d5", "e4", "e5", "c4", "c5", "f4", "f5"].includes(m.to));
            const developmentMoves = moves.filter(m => 
                (m.piece === "n" || m.piece === "b") && 
                ["1", "8"].includes(m.from[1])
            );
            const castling = moves.filter(m => m.san === "O-O" || m.san === "O-O-O");

            // Piece values for capture evaluation
            const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9 };
            const goodCaptures = captures
                .map(m => ({ ...m, value: pieceValues[m.captured] || 0 }))
                .sort((a, b) => b.value - a.value);

            let analysis = `🔍 Position Analysis\n\n`;
            analysis += `Turn: ${chess.turn() === "w" ? "White" : "Black"}\n`;
            analysis += `Total legal moves: ${moves.length}\n\n`;

            if (chess.isCheck()) {
                analysis += "⚠️ YOU ARE IN CHECK! Must respond to check.\n\n";
            }

            if (checks.length > 0) {
                analysis += `👑 Checking moves (${checks.length}): ${checks.map(m => m.san).join(", ")}\n`;
            }

            if (goodCaptures.length > 0) {
                analysis += `⚔️ Captures available:\n`;
                goodCaptures.forEach(m => {
                    analysis += `  - ${m.san} (captures ${m.captured}, worth ${m.value} points)\n`;
                });
            }

            if (castling.length > 0) {
                analysis += `🏰 Castling available: ${castling.map(m => m.san).join(", ")}\n`;
            }

            if (developmentMoves.length > 0 && chess.history().length < 20) {
                analysis += `📦 Development moves: ${developmentMoves.map(m => m.san).join(", ")}\n`;
            }

            if (centerMoves.length > 0) {
                analysis += `🎯 Center control moves: ${centerMoves.slice(0, 5).map(m => m.san).join(", ")}\n`;
            }

            analysis += `\n💡 Suggestions:\n`;
            if (checks.length > 0 && !chess.isCheck()) {
                analysis += "- Consider a checking move to put pressure on opponent\n";
            }
            if (goodCaptures.length > 0 && goodCaptures[0].value >= 3) {
                analysis += `- ${goodCaptures[0].san} captures a valuable piece!\n`;
            }
            if (castling.length > 0 && chess.history().length < 15) {
                analysis += "- Consider castling to protect your king\n";
            }
            if (developmentMoves.length > 0 && chess.history().length < 10) {
                analysis += "- Focus on developing your pieces (knights and bishops)\n";
            }

            return {
                content: [{
                    type: "text",
                    text: analysis
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `❌ Error analyzing: ${error.message}`
                }],
                isError: true
            };
        }
    }
);

// Tool: Resign
server.tool(
    "resign_game",
    "Resign the current game",
    {},
    async () => {
        try {
            if (!socket?.connected) {
                return {
                    content: [{
                        type: "text",
                        text: "❌ Not connected to a game."
                    }],
                    isError: true
                };
            }

            socket.emit("resign");
            return {
                content: [{
                    type: "text",
                    text: "🏳️ You resigned the game."
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `❌ Error: ${error.message}`
                }],
                isError: true
            };
        }
    }
);

// Tool: List available games
server.tool(
    "list_games",
    "List all active public games that can be joined",
    {},
    async () => {
        try {
            const games = await apiRequest("/v1/games");
            
            if (!games || games.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: "No active games available. Create a new game with create_game."
                    }]
                };
            }

            let output = `📋 Active Games (${games.length}):\n\n`;
            games.forEach(game => {
                const needsPlayer = !game.white || !game.black;
                output += `Code: ${game.code}\n`;
                output += `  White: ${game.white?.name || "⏳ waiting"}\n`;
                output += `  Black: ${game.black?.name || "⏳ waiting"}\n`;
                output += `  Status: ${needsPlayer ? "🟢 Open to join" : "🔴 Full"}\n\n`;
            });

            return {
                content: [{
                    type: "text",
                    text: output
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `❌ Error listing games: ${error.message}`
                }],
                isError: true
            };
        }
    }
);

// Start the server
async function main() {
    console.error("[MCP] Moltiverse Chess MCP Server starting...");
    console.error(`[MCP] Connecting to game server at ${API_URL}`);
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error("[MCP] Server ready and listening for commands");
}

main().catch((error) => {
    console.error("[MCP] Fatal error:", error);
    process.exit(1);
});
