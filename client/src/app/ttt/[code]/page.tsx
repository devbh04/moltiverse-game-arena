"use client";

import React, { useContext, useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { API_URL } from "@/config";
import { SessionContext } from "@/context/session";
import type { TTTGame } from "@chessu/types";
import Image from "next/image";

export default function TTTGamePage() {
    const { code } = useParams<{ code: string }>();
    const session = useContext(SessionContext);
    const router = useRouter();
    const socketRef = useRef<Socket | null>(null);

    const [game, setGame] = useState<TTTGame | null>(null);
    const [myRole, setMyRole] = useState<"X" | "O" | "spectator">("spectator");
    const [timer, setTimer] = useState<number>(0);
    const [gameOver, setGameOver] = useState<{
        winner: string;
        xName?: string;
        oName?: string;
    } | null>(null);
    const [sessionEnded, setSessionEnded] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const determineRole = useCallback(
        (g: TTTGame) => {
            if (!session?.user?.id) return "spectator";
            if (g.playerX?.id === session.user.id) return "X";
            if (g.playerO?.id === session.user.id) return "O";
            return "spectator";
        },
        [session?.user?.id]
    );

    useEffect(() => {
        if (!session?.user?.id || !code) return;

        const socket = io(API_URL, { withCredentials: true });
        socketRef.current = socket;

        socket.on("connect", () => {
            socket.emit("tttJoinLobby", code);
        });

        socket.on("tttGameState", (g: TTTGame) => {
            setGame(g);
            setMyRole(determineRole(g));
            if (g.winner) {
                setGameOver({
                    winner: g.winner,
                    xName: g.playerX?.name || undefined,
                    oName: g.playerO?.name || undefined,
                });
            }
        });

        socket.on("tttTurnStart", ({ turn, timeLimit }: { turn: string; timeLimit: number }) => {
            setTimer(timeLimit);
            setGame((prev) => (prev ? { ...prev, turn: turn as "X" | "O" } : prev));

            if (timerRef.current) clearInterval(timerRef.current);
            let t = timeLimit;
            timerRef.current = setInterval(() => {
                t--;
                setTimer(t);
                if (t <= 0 && timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
            }, 1000);
        });

        socket.on("tttMoveMade", ({ index, mark }: { index: number; mark: string }) => {
            setGame((prev) => {
                if (!prev) return prev;
                const newBoard = [...prev.board];
                newBoard[index] = mark;
                return { ...prev, board: newBoard };
            });
        });

        socket.on(
            "tttGameOver",
            (data: { winner: string; xName?: string; oName?: string }) => {
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
                setTimer(0);
                setGameOver(data);
                setGame((prev) => (prev ? { ...prev, winner: data.winner as TTTGame["winner"] } : prev));
            }
        );

        socket.on("tttSessionEnded", () => {
            setSessionEnded(true);
        });

        socket.on("tttSessionContinued", () => {
            setGameOver(null);
            setTimer(0);
        });

        return () => {
            socket.emit("tttLeaveLobby");
            socket.disconnect();
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [session?.user?.id, code, determineRole]);

    function handlePlace(index: number) {
        if (!game || game.winner) return;
        if (game.turn !== myRole) return;
        if (game.board[index] !== null) return;
        socketRef.current?.emit("tttPlaceMove", index);
    }

    function handleJoinAsPlayer() {
        socketRef.current?.emit("tttJoinAsPlayer");
    }

    function handleEndSession() {
        socketRef.current?.emit("tttEndSession");
    }

    function handleContinueSession() {
        socketRef.current?.emit("tttContinueSession");
    }

    if (sessionEnded) {
        return (
            <div className="flex flex-col items-center justify-center gap-6 py-20">
                <h1 className="text-3xl font-bold">Session Ended</h1>
                <p className="text-base-content/60">The game session has been ended.</p>
                <button className="btn btn-primary" onClick={() => router.push("/")}>
                    Back to Home
                </button>
            </div>
        );
    }

    if (!game) {
        return (
            <div className="flex items-center justify-center py-20">
                <span className="loading loading-spinner loading-lg"></span>
            </div>
        );
    }

    const waitingForOpponent = !game.playerO;
    const isPlaying = myRole === "X" || myRole === "O";
    const isMyTurn = game.turn === myRole;
    const xName = game.playerX?.name || "???";
    const oName = game.playerO?.name || "Waiting...";
    const currentTurnName = game.turn === "X" ? xName : oName;
    const timerPercent = (timer / 5) * 100;

    return (
        <div className="flex w-full flex-col items-center gap-8 px-4 py-10 max-w-2xl mx-auto">

            {/* ─── Header: Title + Room ─── */}
            <div className="flex flex-col items-center gap-2">
                <h1 className="text-3xl sm:text-4xl font-extrabold flex items-center gap-3">
                    <img src="/ttt/X.png" alt="" className="h-8 w-8 object-contain" />
                    Tic Tac Toe
                </h1>
                <p className="text-xs text-base-content/40 font-mono tracking-widest uppercase">
                    Room: {code}
                </p>
            </div>

            {/* ─── VS Card ─── */}
            <div className="w-full bg-base-200 rounded-2xl border border-base-300 p-6 relative overflow-hidden">
                {/* Active player indicator line */}
                {!waitingForOpponent && !game.winner && (
                    <div
                        className="absolute top-0 h-1 bg-primary transition-all duration-300"
                        style={{
                            left: game.turn === "X" ? "0%" : "50%",
                            width: "50%",
                        }}
                    />
                )}

                <div className="flex items-center justify-between">
                    {/* Player X */}
                    <div className={
                        "flex flex-col items-center gap-2 flex-1 transition-opacity " +
                        (!waitingForOpponent && game.turn !== "X" && !game.winner ? "opacity-40" : "")
                    }>
                        <div className="relative">
                            <div className={
                                "w-14 h-14 rounded-full flex items-center justify-center shadow-lg " +
                                "border-2 border-blue-500 bg-blue-500/10"
                            }>
                                <Image src="/ttt/X.png" alt="X" width={32} height={32} />
                            </div>
                            {myRole === "X" && (
                                <span className="absolute -bottom-1 -right-1 badge badge-success badge-xs px-1 text-[10px]">YOU</span>
                            )}
                        </div>
                        <span className="font-bold text-sm">{xName}</span>
                        <span className="text-xs text-base-content/40 font-mono">Player X</span>
                    </div>

                    {/* VS */}
                    <span className="text-xl font-bold text-base-content/20 italic mx-4">VS</span>

                    {/* Player O */}
                    <div className={
                        "flex flex-col items-center gap-2 flex-1 transition-opacity " +
                        (!waitingForOpponent && game.turn !== "O" && !game.winner ? "opacity-40" : "")
                    }>
                        <div className="relative">
                            <div className={
                                "w-14 h-14 rounded-full flex items-center justify-center shadow-lg " +
                                (game.playerO
                                    ? "border-2 border-red-500 bg-red-500/10"
                                    : "border-2 border-base-300 bg-base-300")
                            }>
                                <Image src="/ttt/O.png" alt="O" width={32} height={32} className={game.playerO ? "" : "opacity-30"} />
                            </div>
                            {myRole === "O" && (
                                <span className="absolute -bottom-1 -right-1 badge badge-success badge-xs px-1 text-[10px]">YOU</span>
                            )}
                        </div>
                        <span className="font-bold text-sm">{oName}</span>
                        <span className="text-xs text-base-content/40 font-mono">Player O</span>
                    </div>
                </div>
            </div>

            {/* ─── Join button ─── */}
            {myRole === "spectator" && waitingForOpponent && (
                <button className="btn btn-primary btn-wide" onClick={handleJoinAsPlayer}>
                    Join as Player O
                </button>
            )}

            {/* ─── Waiting state ─── */}
            {waitingForOpponent && isPlaying && (
                <div className="flex flex-col items-center gap-3 py-4">
                    <span className="loading loading-dots loading-lg"></span>
                    <p className="text-base-content/60">Waiting for an opponent to join...</p>
                    <p className="text-sm text-base-content/40">
                        Share code: <span className="badge badge-neutral font-mono">{code}</span>
                    </p>
                </div>
            )}

            {/* ─── Turn indicator + Timer ─── */}
            {!game.winner && !waitingForOpponent && (
                <div className="flex flex-col items-center gap-3">
                    <p className="text-sm">
                        {isMyTurn ? (
                            <span className="font-bold text-primary">Your turn ({myRole})</span>
                        ) : (
                            <span className="text-base-content/60">
                                <span className="font-semibold text-primary">{currentTurnName}&apos;s</span> turn ({game.turn})
                            </span>
                        )}
                    </p>
                    {timer > 0 && (
                        <div
                            className="radial-progress text-primary font-bold text-lg"
                            style={{ "--value": timerPercent, "--size": "4rem", "--thickness": "3px" } as React.CSSProperties}
                            role="progressbar"
                        >
                            {timer}s
                        </div>
                    )}
                </div>
            )}

            {/* ─── Board ─── */}
            <div className="bg-base-200 rounded-2xl border border-base-300 p-4">
                <div className="grid grid-cols-3 gap-3">
                    {game.board.map((cell, i) => (
                        <button
                            key={i}
                            className={
                                "flex items-center justify-center rounded-xl w-28 h-28 sm:w-32 sm:h-32 text-5xl font-bold transition-all " +
                                (cell
                                    ? "bg-base-300 cursor-default"
                                    : isMyTurn && !game.winner
                                        ? "bg-base-300 hover:bg-base-content/10 cursor-pointer hover:scale-[1.03]"
                                        : "bg-base-300 cursor-default")
                            }
                            onClick={() => handlePlace(i)}
                            disabled={!!cell || !isMyTurn || !!game.winner || waitingForOpponent}
                        >
                            {cell === "X" && (
                                <Image src="/ttt/X.png" alt="X" width={64} height={64} />
                            )}
                            {cell === "O" && (
                                <Image src="/ttt/O.png" alt="O" width={64} height={64} />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* ─── Game over modal ─── */}
            {gameOver && (
                <div className="modal modal-open">
                    <div className="modal-box text-center">
                        <h2 className="text-2xl font-bold mb-4">🏆 Game Over!</h2>
                        <p className="text-xl font-bold mb-6">
                            {gameOver.winner === "draw"
                                ? "It's a draw!"
                                : gameOver.winner === "X"
                                    ? `${gameOver.xName} (X) wins!`
                                    : `${gameOver.oName} (O) wins!`}
                        </p>
                        {isPlaying && (
                            <div className="flex gap-4 justify-center">
                                <button className="btn btn-primary" onClick={handleContinueSession}>
                                    Continue Session
                                </button>
                                <button className="btn btn-error btn-outline" onClick={handleEndSession}>
                                    End Session
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
