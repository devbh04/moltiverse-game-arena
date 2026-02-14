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

// Generate a consistent color from a string
function avatarColor(name: string): string {
    const colors = [
        "bg-blue-500", "bg-pink-500", "bg-green-500", "bg-purple-500",
        "bg-orange-500", "bg-teal-500", "bg-indigo-500", "bg-rose-500",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

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

    const waitingForOpponent = !game.player2;
    const isPlaying = myRole === "p1" || myRole === "p2";
    const p1Name = game.player1?.name || "???";
    const p2Name = game.player2?.name || "Waiting...";
    const timerPercent = (timer / 3) * 100;

    return (
        <div className="flex w-full flex-col items-center gap-8 px-4 py-10 max-w-2xl mx-auto">

            {/* ─── Header: Live badge + Title + Room ─── */}
            <div className="flex flex-col items-center gap-3">
                <div className="badge badge-outline gap-2 px-4 py-3">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    <span className="text-xs font-semibold tracking-wider uppercase">Live Match</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold flex items-center gap-3">
                    <img src="/rpc/rock.png" alt="" className="h-10 w-10 object-contain" />
                    Rock Paper Scissors
                </h1>
                <p className="text-sm text-base-content/50">
                    Room: <span className="badge badge-neutral badge-sm font-mono">{code}</span>
                </p>
            </div>

            {/* ─── VS Arena ─── */}
            <div className="w-full">
                <p className="text-center text-sm font-bold text-base-content/40 tracking-widest mb-6">VS</p>

                <div className="flex items-center justify-between gap-4">
                    {/* Player 1 */}
                    <div className="flex flex-col items-center gap-2 flex-1">
                        <div className="flex items-center gap-3">
                            <div className="flex flex-col items-end">
                                <span className="font-bold text-sm sm:text-base">{p1Name}</span>
                                <span className="badge badge-ghost badge-xs mt-0.5">P1</span>
                            </div>
                            <div className={`w-12 h-12 rounded-full ${avatarColor(p1Name)} flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
                                {p1Name.charAt(0).toUpperCase()}
                            </div>
                        </div>
                        <span className="text-4xl font-black">{game.scores.p1}</span>
                        {locked.p1 && <span className="badge badge-success badge-sm">Locked</span>}
                    </div>

                    {/* Center: Timer */}
                    <div className="flex flex-col items-center gap-3">
                        {game.roundState === "picking" ? (
                            <div
                                className="radial-progress text-primary font-bold text-xl"
                                style={{ "--value": timerPercent, "--size": "5rem", "--thickness": "4px" } as React.CSSProperties}
                                role="progressbar"
                            >
                                {timer}s
                            </div>
                        ) : (
                            <div className="w-20 h-20 rounded-full border-4 border-base-300 flex items-center justify-center">
                                <span className="text-base-content/30 text-sm font-bold">
                                    {game.roundState === "waiting" ? "⏳" : "✓"}
                                </span>
                            </div>
                        )}
                        <p className="text-xs font-semibold text-base-content/40 tracking-widest uppercase">
                            Round {game.round} of 3
                        </p>
                    </div>

                    {/* Player 2 */}
                    <div className="flex flex-col items-center gap-2 flex-1">
                        <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-full ${game.player2 ? avatarColor(p2Name) : "bg-base-300"} flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
                                {game.player2 ? p2Name.charAt(0).toUpperCase() : "?"}
                            </div>
                            <div className="flex flex-col items-start">
                                <span className="font-bold text-sm sm:text-base">{p2Name}</span>
                                <span className="badge badge-ghost badge-xs mt-0.5">P2</span>
                            </div>
                        </div>
                        <span className="text-4xl font-black">{game.scores.p2}</span>
                        {locked.p2 && <span className="badge badge-success badge-sm">Locked</span>}
                    </div>
                </div>
            </div>

            {/* ─── Join button for spectators ─── */}
            {myRole === "spectator" && waitingForOpponent && (
                <button className="btn btn-primary btn-wide" onClick={handleJoinAsPlayer}>
                    Join as Player 2
                </button>
            )}

            {/* ─── Waiting state ─── */}
            {waitingForOpponent && game.roundState === "waiting" && isPlaying && (
                <div className="flex flex-col items-center gap-3 py-4">
                    <span className="loading loading-dots loading-lg"></span>
                    <p className="text-base-content/60">Waiting for an opponent to join...</p>
                    <p className="text-sm text-base-content/40">
                        Share code: <span className="badge badge-neutral font-mono">{code}</span>
                    </p>
                </div>
            )}

            {/* ─── Choice cards ─── */}
            {isPlaying && game.roundState === "picking" && (
                <div className="w-full flex flex-col items-center gap-4">
                    <p className="text-sm text-base-content/40">Make your choice to lock in</p>
                    <div className="grid grid-cols-3 gap-4 w-full max-w-md">
                        {CHOICES.map((choice) => (
                            <button
                                key={choice}
                                className={
                                    "flex flex-col items-center gap-3 rounded-2xl border-2 p-6 transition-all " +
                                    (myPick === choice
                                        ? "border-primary bg-primary/10 shadow-lg shadow-primary/20 scale-105"
                                        : "border-base-300 bg-base-100 hover:border-base-content/20 hover:shadow-md hover:scale-[1.02]") +
                                    (myPick && myPick !== choice ? " opacity-40" : "")
                                }
                                onClick={() => handlePick(choice)}
                                disabled={!!myPick}
                            >
                                <Image
                                    src={CHOICE_IMAGES[choice]}
                                    alt={choice}
                                    width={72}
                                    height={72}
                                    className="object-contain"
                                />
                                <span className="capitalize font-semibold text-sm">{choice}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ─── Spectator view during picking ─── */}
            {myRole === "spectator" && game.roundState === "picking" && (
                <div className="flex flex-col items-center gap-3 py-4">
                    <p className="text-base-content/50 text-sm">Players are picking...</p>
                    <div className="flex gap-3">
                        {locked.p1 && <span className="badge badge-success gap-1">P1 Locked ✓</span>}
                        {locked.p2 && <span className="badge badge-success gap-1">P2 Locked ✓</span>}
                    </div>
                </div>
            )}

            {/* ─── Round result ─── */}
            {roundResult && (
                <div className="w-full max-w-md bg-base-200 rounded-2xl border border-base-300 p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col items-center gap-2 flex-1">
                            <span className="text-sm font-semibold">{game.player1?.name}</span>
                            <Image
                                src={CHOICE_IMAGES[roundResult.p1Pick as Choice]}
                                alt={roundResult.p1Pick}
                                width={72}
                                height={72}
                            />
                            <span className="capitalize text-xs text-base-content/60">{roundResult.p1Pick}</span>
                        </div>
                        <span className="text-2xl font-bold text-base-content/30">VS</span>
                        <div className="flex flex-col items-center gap-2 flex-1">
                            <span className="text-sm font-semibold">{game.player2?.name}</span>
                            <Image
                                src={CHOICE_IMAGES[roundResult.p2Pick as Choice]}
                                alt={roundResult.p2Pick}
                                width={72}
                                height={72}
                            />
                            <span className="capitalize text-xs text-base-content/60">{roundResult.p2Pick}</span>
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

            {/* ─── Game over modal ─── */}
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
