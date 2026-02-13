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
                <button className="btn btn-primary" onClick={() => router.push("/ttt")}>
                    Back to TTT Lobby
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

    return (
        <div className="flex w-full flex-col items-center gap-6 px-4 py-8">
            <h1 className="text-2xl font-bold">❌ Tic Tac Toe</h1>
            <p className="font-mono text-sm text-base-content/60">Room: {code}</p>

            {/* Players */}
            <div className="flex items-center gap-8">
                <div className="flex flex-col items-center">
                    <span className="font-bold">{game.playerX?.name || "???"}</span>
                    <span className="badge badge-primary mt-1">X</span>
                </div>
                <span className="text-xl font-bold text-base-content/40">vs</span>
                <div className="flex flex-col items-center">
                    <span className="font-bold">{game.playerO?.name || "Waiting..."}</span>
                    <span className="badge badge-secondary mt-1">O</span>
                </div>
            </div>

            {/* Join button */}
            {myRole === "spectator" && waitingForOpponent && (
                <button className="btn btn-primary" onClick={handleJoinAsPlayer}>
                    Join as Player O
                </button>
            )}

            {/* Turn info + timer */}
            {!game.winner && !waitingForOpponent && (
                <div className="flex flex-col items-center gap-2">
                    <p className="text-lg">
                        {isMyTurn ? (
                            <span className="font-bold text-success">Your turn ({myRole})</span>
                        ) : (
                            <span className="text-base-content/60">
                                {game.turn === "X" ? game.playerX?.name : game.playerO?.name}&apos;s turn ({game.turn})
                            </span>
                        )}
                    </p>
                    {timer > 0 && (
                        <div
                            className="radial-progress text-primary"
                            style={{ "--value": (timer / 5) * 100, "--size": "3.5rem" } as React.CSSProperties}
                        >
                            {timer}s
                        </div>
                    )}
                </div>
            )}

            {/* Waiting */}
            {waitingForOpponent && isPlaying && (
                <div className="flex flex-col items-center gap-2">
                    <span className="loading loading-dots loading-lg"></span>
                    <p>Waiting for an opponent to join...</p>
                    <p className="font-mono text-sm text-base-content/50">
                        Share code: <span className="badge badge-neutral">{code}</span>
                    </p>
                </div>
            )}

            {/* Board */}
            <div className="grid grid-cols-3 gap-2">
                {game.board.map((cell, i) => (
                    <button
                        key={i}
                        className={
                            "flex h-24 w-24 items-center justify-center rounded-lg text-4xl font-bold transition-all " +
                            (cell
                                ? "bg-base-200 cursor-default"
                                : isMyTurn && !game.winner
                                    ? "bg-base-200 hover:bg-primary/20 cursor-pointer"
                                    : "bg-base-200 cursor-default")
                        }
                        onClick={() => handlePlace(i)}
                        disabled={!!cell || !isMyTurn || !!game.winner}
                    >
                        {cell === "X" && (
                            <Image src="/ttt/X.png" alt="X" width={56} height={56} />
                        )}
                        {cell === "O" && (
                            <Image src="/ttt/O.png" alt="O" width={56} height={56} />
                        )}
                    </button>
                ))}
            </div>

            {/* Game over modal */}
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
