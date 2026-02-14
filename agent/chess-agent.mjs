/**
 * Moltbot Chess Agent
 * Connects to moltiverse-game-arena and plays chess automatically
 * 
 * Usage:
 *   node chess-agent.mjs [gameCode]
 *   node chess-agent.mjs --create [side]
 *   
 * Examples:
 *   node chess-agent.mjs              # Create new game as random side
 *   node chess-agent.mjs CtABl_       # Join existing game
 *   node chess-agent.mjs --create white  # Create game as white
 */

import { io } from "socket.io-client";
import { Chess } from "chess.js";

const SERVER = process.env.SERVER_URL || "http://localhost:3001";
const AGENT_NAME = process.env.AGENT_NAME || "Moltbot";

class ChessAgent {
  constructor() {
    this.chess = new Chess();
    this.socket = null;
    this.gameCode = null;
    this.mySide = null; // 'white' or 'black'
    this.cookies = null;
    this.lastMoveCount = -1; // Track moves to avoid duplicate moves
    this.isProcessingMove = false; // Prevent concurrent move calculations
    this.bothPlayersJoined = false;
  }

  async authenticate() {
    console.log(`🎮 ${AGENT_NAME} authenticating...`);
    
    const res = await fetch(`${SERVER}/v1/auth/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: AGENT_NAME })
    });

    if (!res.ok) {
      throw new Error(`Auth failed: ${res.status}`);
    }

    this.cookies = res.headers.get("set-cookie");
    const user = await res.json();
    console.log(`✅ Authenticated as: ${user.name} (${user.id})`);
    return user;
  }

  async createGame(side = "random") {
    console.log(`🎯 Creating game as ${side}...`);
    
    const res = await fetch(`${SERVER}/v1/games`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Cookie": this.cookies
      },
      body: JSON.stringify({ side })
    });

    if (!res.ok) {
      throw new Error(`Create game failed: ${res.status}`);
    }

    const game = await res.json();
    this.gameCode = game.code;
    console.log(`✅ Game created: ${this.gameCode}`);
    console.log(`🔗 Join at: http://localhost:3000/${this.gameCode}`);
    return game;
  }

  connectSocket() {
    return new Promise((resolve, reject) => {
      console.log("🔌 Connecting WebSocket...");
      
      this.socket = io(SERVER, {
        extraHeaders: { Cookie: this.cookies },
        transports: ["websocket", "polling"]
      });

      this.socket.on("connect", () => {
        console.log("✅ WebSocket connected");
        resolve();
      });

      this.socket.on("connect_error", (err) => {
        console.error("❌ Connection error:", err.message);
        reject(err);
      });

      this.socket.on("disconnect", (reason) => {
        console.log("🔌 Disconnected:", reason);
      });

      // Game events
      this.socket.on("receivedLatestGame", (game) => this.onGameState(game));
      this.socket.on("receivedMove", (move) => this.onOpponentMove(move));
      this.socket.on("gameOver", (result) => this.onGameOver(result));
      this.socket.on("userJoinedAsPlayer", (data) => {
        console.log(`👤 ${data.name} joined as ${data.side}`);
      });
      this.socket.on("opponentDisconnected", () => {
        console.log("⚠️ Opponent disconnected");
      });
      this.socket.on("drawOffered", (data) => {
        console.log(`🤝 Draw offered by ${data.name}`);
        this.socket.emit("declineDraw");
      });
    });
  }

  joinLobby(code) {
    this.gameCode = code;
    console.log(`🚪 Joining lobby: ${code}`);
    this.socket.emit("joinLobby", code);
  }

  joinAsPlayer() {
    console.log("🎮 Joining as player...");
    this.socket.emit("joinAsPlayer");
  }

  onGameState(game) {
    console.log("\n📋 Game State Update:");
    console.log(`   White: ${game.white?.name || "waiting..."} ${game.white?.connected ? "🟢" : "🔴"}`);
    console.log(`   Black: ${game.black?.name || "waiting..."} ${game.black?.connected ? "🟢" : "🔴"}`);
    
    // Determine our side
    if (game.white?.name === AGENT_NAME) {
      this.mySide = "white";
    } else if (game.black?.name === AGENT_NAME) {
      this.mySide = "black";
    }
    
    if (this.mySide) {
      console.log(`   Playing as: ${this.mySide}`);
    }

    // Load game state from server's PGN - always trust server state
    this.chess = new Chess();
    if (game.pgn) {
      this.chess.loadPgn(game.pgn);
    }

    const currentMoveCount = this.chess.history().length;
    console.log(`   Total moves: ${currentMoveCount}`);

    // Check if both players are present
    if (!game.white || !game.black) {
      console.log("⏳ Waiting for opponent to join...");
      this.bothPlayersJoined = false;
      return;
    }

    this.bothPlayersJoined = true;

    // Only make a move if this is a new game state (move count changed)
    if (currentMoveCount !== this.lastMoveCount) {
      this.lastMoveCount = currentMoveCount;
      this.checkAndMove();
    } else {
      console.log("   (No new moves, skipping)");
    }
  }

  onOpponentMove(move) {
    console.log(`\n♟️ Opponent moved: ${move.from} → ${move.to}${move.promotion ? ` (=${move.promotion})` : ""}`);
    
    try {
      this.chess.move(move);
      this.lastMoveCount = this.chess.history().length;
      this.printBoard();
      
      // Now it's our turn - add delay to seem more natural
      setTimeout(() => this.checkAndMove(), 1500);
    } catch (err) {
      console.error("Invalid move received:", err.message);
    }
  }

  checkAndMove() {
    // Prevent concurrent move processing
    if (this.isProcessingMove) {
      console.log("⏳ Already processing a move...");
      return;
    }

    if (!this.bothPlayersJoined) {
      console.log("⏳ Waiting for both players...");
      return;
    }

    const turn = this.chess.turn();
    const isMyTurn = (turn === "w" && this.mySide === "white") || 
                     (turn === "b" && this.mySide === "black");
    
    console.log(`\n🎯 Turn: ${turn === "w" ? "White" : "Black"} | My side: ${this.mySide} | My turn: ${isMyTurn}`);
    
    if (!isMyTurn) {
      console.log("⏳ Waiting for opponent's move...");
      return;
    }

    if (this.chess.isGameOver()) {
      console.log("🏁 Game already over");
      return;
    }

    this.isProcessingMove = true;

    // Add a thinking delay to seem more human-like
    const thinkTime = 1000 + Math.random() * 2000; // 1-3 seconds
    console.log(`🤔 Thinking for ${Math.round(thinkTime/1000)}s...`);

    setTimeout(() => {
      const move = this.calculateMove();
      if (move) {
        this.makeMove(move);
      }
      this.isProcessingMove = false;
    }, thinkTime);
  }

  calculateMove() {
    const moves = this.chess.moves({ verbose: true });
    
    if (moves.length === 0) {
      console.log("No legal moves available");
      return null;
    }

    // Check for checkmate first
    for (const m of moves) {
      const testChess = new Chess(this.chess.fen());
      testChess.move(m);
      if (testChess.isCheckmate()) {
        console.log("🎯 Found checkmate!");
        return m;
      }
    }

    // Find checks
    const checks = moves.filter(m => {
      const testChess = new Chess(this.chess.fen());
      testChess.move(m);
      return testChess.inCheck();
    });

    // Find captures sorted by value
    const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    const captures = moves.filter(m => m.captured)
      .sort((a, b) => (pieceValues[b.captured] || 0) - (pieceValues[a.captured] || 0));

    let selectedMove;

    if (checks.length > 0 && Math.random() > 0.3) {
      selectedMove = checks[Math.floor(Math.random() * checks.length)];
      console.log("🎯 Playing a check!");
    } else if (captures.length > 0 && Math.random() > 0.2) {
      selectedMove = captures[0]; // Best capture
      console.log(`🎯 Capturing ${selectedMove.captured}!`);
    } else {
      // Opening: prefer center control
      const moveNum = this.chess.history().length;
      if (moveNum < 10) {
        const devMoves = moves.filter(m => 
          ["d4", "e4", "d5", "e5", "c4", "c5"].includes(m.to) ||
          (m.piece === "n" && ["c3", "f3", "c6", "f6"].includes(m.to)) ||
          (m.piece === "b")
        );
        if (devMoves.length > 0) {
          selectedMove = devMoves[Math.floor(Math.random() * devMoves.length)];
        }
      }
      
      // Fallback to random
      if (!selectedMove) {
        selectedMove = moves[Math.floor(Math.random() * moves.length)];
      }
    }

    return selectedMove;
  }

  makeMove(move) {
    console.log(`\n🎮 ${AGENT_NAME} plays: ${move.san || `${move.from}-${move.to}`}`);
    
    this.chess.move(move);
    this.lastMoveCount = this.chess.history().length;
    this.printBoard();
    
    this.socket.emit("sendMove", {
      from: move.from,
      to: move.to,
      promotion: move.promotion
    });
  }

  printBoard() {
    console.log("\n" + this.chess.ascii());
  }

  onGameOver(result) {
    console.log("\n🏆 ═══════════════════════════════");
    console.log("        GAME OVER!");
    console.log("═══════════════════════════════");
    console.log(`   Reason: ${result.reason}`);
    if (result.winnerName) {
      console.log(`   Winner: ${result.winnerName} (${result.winnerSide})`);
      if (result.winnerName === AGENT_NAME) {
        console.log("\n   🎉🎉🎉 I WON! 🎉🎉🎉");
      } else {
        console.log("\n   😔 Better luck next time!");
      }
    } else {
      console.log("\n   🤝 It's a draw!");
    }
    console.log("═══════════════════════════════\n");
    
    setTimeout(() => {
      this.socket.disconnect();
      process.exit(0);
    }, 3000);
  }

  async run(gameCode = null, side = "random") {
    try {
      await this.authenticate();

      if (gameCode) {
        this.gameCode = gameCode;
        console.log(`🎯 Joining existing game: ${gameCode}`);
      } else {
        await this.createGame(side);
      }

      await this.connectSocket();
      this.joinLobby(this.gameCode);

      if (gameCode) {
        setTimeout(() => this.joinAsPlayer(), 1000);
      }

      console.log("\n🎮 Agent running. Press Ctrl+C to quit.\n");

    } catch (err) {
      console.error("❌ Error:", err.message);
      process.exit(1);
    }
  }
}

// Parse args
const args = process.argv.slice(2);
let gameCode = null;
let side = "random";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--create" && args[i + 1]) {
    side = args[i + 1];
    i++;
  } else if (!args[i].startsWith("--")) {
    gameCode = args[i];
  }
}

const agent = new ChessAgent();
agent.run(gameCode, side);
