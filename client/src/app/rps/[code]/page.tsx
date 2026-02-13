"use client";

import React, { useContext, useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { API_URL } from "@/config";
import { SessionContext } from "@/context/session";
import type { RPSGame } from "@chessu/types";
import Image from "next/image";

const CHOICES = ["rock", "paper", "scissors"] as const;
type Choice = (typeof CHOICES)[number];

const CHOICE_IMAGES: Record<Choice, string> = {
    rock: "/rpc/rock.png",
    paper: "/rpc/paper.png",
    scissors: "/rpc/scissors.png",
};

export default function RPSGamePage() {
    const { code } = useParams<{ code: string }>();
    const session = useContext(SessionContext);
    const router = useRouter();
    const socketRef = useRef<Socket | null>(null);

    const [game, setGame] = useState<RPSGame | null>(null);
    const [myRole, setMyRole] = useState<"p1" | "p2" | "spectator">("spectator");
    const [myPick, setMyPick] = useState<Choice | null>(null);
    const [locked, setLocked] = useState<{ p1: boolean; p2: boolean }>({ p1: false, p2: false });
    const [timer, setTimer] = useState<number>(0);
    const [roundResult, setRoundResult] = useState<{
        p1Pick: string;
        p2Pick: string;
        winner: string;
    } | null>(null);
    const [gameOver, setGameOver] = useState<{
        winner: string;
        scores: { p1: number; p2: number };
        p1Name?: string;
        p2Name?: string;
    } | null>(null);
    const [sessionEnded, setSessionEnded] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const determineRole = useCallback(
        (g: RPSGame) => {
            if (!session?.user?.id) return "spectator";
            if (g.player1?.id === session.user.id) return "p1";
            if (g.player2?.id === session.user.id) return "p2";
            return "spectator";
        },
        [session?.user?.id]
    );

    useEffect(() => {
        if (!session?.user?.id || !code) return;

        const socket = io(API_URL, { withCredentials: true });
        socketRef.current = socket;

        socket.on("connect", () => {
            socket.emit("rpsJoinLobby", code);
        });

        socket.on("rpsGameState", (g: RPSGame) => {
            setGame(g);
            setMyRole(determineRole(g));
            if (g.roundState === "done" && g.winner) {
                setGameOver({
                    winner: g.winner,
                    scores: g.scores,
                    p1Name: g.player1?.name || undefined,
                    p2Name: g.player2?.name || undefined,
                });
            }
        });

        socket.on("rpsRoundStart", ({ round, timeLimit }: { round: number; timeLimit: number }) => {
            setMyPick(null);
            setLocked({ p1: false, p2: false });
            setRoundResult(null);
            setTimer(timeLimit);

            setGame((prev) =>
                prev ? { ...prev, round, roundState: "picking", picks: {} } : prev
            );

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

        socket.on("rpsPlayerLocked", ({ player }: { player: "p1" | "p2" }) => {
            setLocked((prev) => ({ ...prev, [player]: true }));
        });

        socket.on(
            "rpsRoundResult",
            (data: {
                p1Pick: string;
                p2Pick: string;
                winner: string;
                scores: { p1: number; p2: number };
                round: number;
            }) => {
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
                setTimer(0);
                setRoundResult({ p1Pick: data.p1Pick, p2Pick: data.p2Pick, winner: data.winner });
                setGame((prev) =>
                    prev
                        ? { ...prev, scores: data.scores, roundState: "reveal", round: data.round }
                        : prev
                );
            }
        );

        socket.on(
            "rpsGameOver",
            (data: {
                winner: string;
                scores: { p1: number; p2: number };
                p1Name?: string;
                p2Name?: string;
            }) => {
                setGameOver(data);
                setGame((prev) => (prev ? { ...prev, winner: data.winner as RPSGame["winner"], roundState: "done" } : prev));
            }
        );

        socket.on("rpsSessionEnded", () => {
            setSessionEnded(true);
        });

        socket.on("rpsSessionContinued", () => {
            setGameOver(null);
            setRoundResult(null);
            setMyPick(null);
            setLocked({ p1: false, p2: false });
            setTimer(0);
        });

        return () => {
            socket.emit("rpsLeaveLobby");
            socket.disconnect();
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [session?.user?.id, code, determineRole]);

    function handlePick(choice: Choice) {
        if (myPick || !socketRef.current) return;
        setMyPick(choice);
        socketRef.current.emit("rpsPick", choice);
    }

    function handleJoinAsPlayer() {
        socketRef.current?.emit("rpsJoinAsPlayer");
    }

    function handleEndSession() {
        socketRef.current?.emit("rpsEndSession");
    }

    function handleContinueSession() {
        socketRef.current?.emit("rpsContinueSession");
    }

    if (sessionEnded) {
        return (
            <div className="flex flex-col items-center justify-center gap-6 py-20">
                <h1 className="text-3xl font-bold">Session Ended</h1>
                <p className="text-base-content/60">The game session has been ended.</p>
                <button className="btn btn-primary" onClick={() => router.push("/rps")}>
                    Back to RPS Lobby
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

    const waitingForOpponent = !game.player2;
    const isPlaying = myRole === "p1" || myRole === "p2";

    return (
        <div className="flex w-full flex-col items-center gap-6 px-4 py-8">
            <h1 className="text-2xl font-bold">🪨 Rock Paper Scissors</h1>
            <p className="font-mono text-sm text-base-content/60">Room: {code}</p>

            {/* Players */}
            <div className="flex items-center gap-8">
                <div className="flex flex-col items-center">
                    <span className="font-bold">{game.player1?.name || "???"}</span>
                    <span className="badge badge-primary mt-1">P1</span>
                    <span className="text-2xl font-bold mt-1">{game.scores.p1}</span>
                </div>
                <span className="text-xl font-bold text-base-content/40">vs</span>
                <div className="flex flex-col items-center">
                    <span className="font-bold">{game.player2?.name || "Waiting..."}</span>
                    <span className="badge badge-secondary mt-1">P2</span>
                    <span className="text-2xl font-bold mt-1">{game.scores.p2}</span>
                </div>
            </div>

            {/* Join button for spectators */}
            {myRole === "spectator" && waitingForOpponent && (
                <button className="btn btn-primary" onClick={handleJoinAsPlayer}>
                    Join as Player 2
                </button>
            )}

            {/* Round info */}
            {game.roundState === "picking" && (
                <div className="flex flex-col items-center gap-2">
                    <p className="text-lg font-semibold">Round {game.round} of 3</p>
                    <div className="radial-progress text-primary" style={{ "--value": (timer / 3) * 100, "--size": "4rem" } as React.CSSProperties}>
                        {timer}s
                    </div>
                    <div className="flex gap-2">
                        {locked.p1 && <span className="badge badge-success">P1 Locked</span>}
                        {locked.p2 && <span className="badge badge-success">P2 Locked</span>}
                    </div>
                </div>
            )}

            {/* Pick buttons */}
            {isPlaying && game.roundState === "picking" && (
                <div className="flex gap-6">
                    {CHOICES.map((choice) => (
                        <button
                            key={choice}
                            className={
                                "btn btn-lg h-auto flex-col gap-2 p-4" +
                                (myPick === choice ? " btn-primary ring-4 ring-primary/50" : " btn-ghost")
                            }
                            onClick={() => handlePick(choice)}
                            disabled={!!myPick}
                        >
                            <Image src={CHOICE_IMAGES[choice]} alt={choice} width={64} height={64} />
                            <span className="capitalize text-sm">{choice}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Round result */}
            {roundResult && (
                <div className="card bg-base-200 p-6">
                    <div className="flex items-center gap-8">
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-sm font-semibold">{game.player1?.name}</span>
                            <Image
                                src={CHOICE_IMAGES[roundResult.p1Pick as Choice]}
                                alt={roundResult.p1Pick}
                                width={80}
                                height={80}
                            />
                            <span className="capitalize">{roundResult.p1Pick}</span>
                        </div>
                        <span className="text-2xl font-bold">vs</span>
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-sm font-semibold">{game.player2?.name}</span>
                            <Image
                                src={CHOICE_IMAGES[roundResult.p2Pick as Choice]}
                                alt={roundResult.p2Pick}
                                width={80}
                                height={80}
                            />
                            <span className="capitalize">{roundResult.p2Pick}</span>
                        </div>
                    </div>
                    <p className="mt-4 text-center text-lg font-bold">
                        {roundResult.winner === "draw"
                            ? "Draw!"
                            : roundResult.winner === "p1"
                                ? `${game.player1?.name} wins the round!`
                                : `${game.player2?.name} wins the round!`}
                    </p>
                </div>
            )}

            {/* Waiting state */}
            {waitingForOpponent && game.roundState === "waiting" && isPlaying && (
                <div className="flex flex-col items-center gap-2">
                    <span className="loading loading-dots loading-lg"></span>
                    <p>Waiting for an opponent to join...</p>
                    <p className="font-mono text-sm text-base-content/50">
                        Share code: <span className="badge badge-neutral">{code}</span>
                    </p>
                </div>
            )}

            {/* Game over modal */}
            {gameOver && (
                <div className="modal modal-open">
                    <div className="modal-box text-center">
                        <h2 className="text-2xl font-bold mb-4">🏆 Game Over!</h2>
                        <p className="text-lg mb-2">
                            Final Score: {gameOver.p1Name} {gameOver.scores.p1} — {gameOver.scores.p2}{" "}
                            {gameOver.p2Name}
                        </p>
                        <p className="text-xl font-bold mb-6">
                            {gameOver.winner === "draw"
                                ? "It's a draw!"
                                : gameOver.winner === "player1"
                                    ? `${gameOver.p1Name} wins!`
                                    : `${gameOver.p2Name} wins!`}
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
