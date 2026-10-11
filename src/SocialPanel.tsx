import type { CourseSummary } from "../shared/course";
import { useState, useEffect } from "react";
import { SIGNALS, type BattleView } from "../shared/social";
import { socialCall, type useSocialPresence } from "./socialPresence";
export default function SocialPanel({
  social,
  playerId,
  onRewards,
  courses,
}: {
  social: ReturnType<typeof useSocialPresence>;
  playerId: string;
  onRewards: () => void;
  courses: CourseSummary[];
}) {
  const [name, setName] = useState(""),
    [invite, setInvite] = useState(""),
    [opponent, setOpponent] = useState(""),
    [courseId, setCourseId] = useState(""),
    [battle, setBattle] = useState<BattleView | null>(null),
    [answer, setAnswer] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [reports, setReports] = useState<
      { id: string; target_id: string; reason: string; resolved: boolean }[]
    >([]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      await social.refresh();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!battle || battle.status === "complete") return;
    let alive = true,
      pending = false;
    const timer = window.setInterval(async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const current = await socialCall("/battles/" + battle.id);
        if (alive) {
          setBattle(current);
          if (current.status === "complete") onRewards();
        }
      } catch {
        /* The explicit refresh control remains available after reconnect. */
      } finally {
        pending = false;
      }
    }, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [battle?.id, battle?.status]);
  const team = social.state.team;
  const participant = battle?.players.find((p) => p.id === playerId);
  const question = participant
    ? battle?.questions[participant.answered]
    : undefined;
  return (
    <section aria-label="Teams and shared world" className="wardrobe">
      <h2>Learn together</h2>
      <p>
        Shared rooms hold up to eight explorers. Teams hold up to four. Solo
        learning stays available.
      </p>
      {social.joined ? (
        <button onClick={() => void action(social.leave)}>
          Leave shared room
        </button>
      ) : (
        <button onClick={social.join}>Join shared room</button>
      )}
      {social.joined && (
        <>
          <label>
            Preset message
            <select
              aria-label="Preset message"
              defaultValue=""
              onChange={(e) => social.send(e.target.value)}
            >
              <option value="">Choose…</option>
              {SIGNALS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <p>{social.state.presence.length} nearby explorers</p>
          {social.state.presence.map((p) => (
            <article key={p.id}>
              <strong>{p.name}</strong> · {p.signal || "Learning nearby"}
              <button
                onClick={() =>
                  void action(async () => {
                    await socialCall("/block", { targetId: p.id });
                  })
                }
              >
                Block {p.name}
              </button>
              <button
                onClick={() =>
                  void action(async () => {
                    await socialCall("/report", {
                      targetId: p.id,
                      reason: "harassment",
                    });
                    setMessage("Report saved for moderator review.");
                  })
                }
              >
                Report {p.name}
              </button>
            </article>
          ))}
        </>
      )}
      {social.state.blocked.map((p) => (
        <button
          key={p.id}
          onClick={() =>
            void action(async () => {
              await socialCall("/unblock", { targetId: p.id });
            })
          }
        >
          Unblock {p.name}
        </button>
      ))}
      {!team ? (
        <>
          <label>
            Team name
            <input
              aria-label="Team name"
              value={name}
              maxLength={32}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await socialCall("/teams", { name });
              })
            }
          >
            Create team
          </button>
          <label>
            Private team invite
            <input
              aria-label="Private team invite"
              value={invite}
              maxLength={32}
              onChange={(e) => setInvite(e.target.value)}
            />
          </label>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await socialCall("/teams/join", { invite });
              })
            }
          >
            Join team
          </button>
        </>
      ) : (
        <>
          <h3>{team.name}</h3>
          <p>
            Private invite: <code>{team.invite}</code>
          </p>
          <p>{team.members.map((m) => m.name).join(", ")}</p>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await socialCall("/teams/leave", {});
              })
            }
          >
            Leave team
          </button>
          {team.ownerId === playerId && (
            <>
              <label>
                Opponent team invite
                <input
                  aria-label="Opponent team invite"
                  value={opponent}
                  maxLength={32}
                  onChange={(e) => setOpponent(e.target.value)}
                />
              </label>
              <label>
                Battle course
                <select
                  aria-label="Battle course"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                >
                  <option value="">Choose a course…</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Every participant must enroll in the same course version before
                acceptance. No entry fee.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    setBattle(
                      await socialCall("/battles", {
                        opponentInvite: opponent,
                        courseId,
                      }),
                    );
                  })
                }
              >
                Invite learning battle
              </button>
            </>
          )}
        </>
      )}
      {social.state.battles.map((b) => (
        <button
          key={b.id}
          onClick={() =>
            void action(async () => {
              setBattle(await socialCall("/battles/" + b.id));
              setAnswer(null);
            })
          }
        >
          Open battle: {b.courseTitle} · {b.status}
        </button>
      ))}
      {battle && (
        <article aria-label="Learning battle">
          <h3>
            {battle.courseTitle} · v{battle.courseVersion}
          </h3>
          <p>{battle.teams.map((t) => t.name + ": " + t.score).join(" · ")}</p>
          <p>
            {battle.status} · {new Date(battle.expiresAt).toLocaleTimeString()}
          </p>
          {battle.status === "pending" &&
            team?.id === battle.teams[1]?.id &&
            team.ownerId === playerId && (
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    setBattle(
                      await socialCall("/battles/" + battle.id + "/accept", {}),
                    );
                  })
                }
              >
                Accept battle
              </button>
            )}
          {battle.status === "active" && question && (
            <>
              <h4>{question.prompt}</h4>
              <div className="answers">
                {question.options.map((q, i) => (
                  <button
                    key={i}
                    aria-pressed={answer === i}
                    onClick={() => setAnswer(i)}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <button
                disabled={busy || answer === null}
                onClick={() =>
                  void action(async () => {
                    setBattle(
                      await socialCall("/battles/" + battle.id + "/answer", {
                        questionId: question.id,
                        answer,
                      }),
                    );
                    setAnswer(null);
                    onRewards();
                  })
                }
              >
                Submit battle answer
              </button>
            </>
          )}
          {battle.status === "active" && !question && (
            <p>
              Your answers are saved. Waiting for the other participants or the
              ten-minute deadline.
            </p>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                setBattle(await socialCall("/battles/" + battle.id));
                onRewards();
              })
            }
          >
            Refresh battle
          </button>
          {battle.result && (
            <p>
              Battle complete · {battle.result.rewards[playerId] ?? 0} team
              activity points. Individual mastery is unchanged.
            </p>
          )}
        </article>
      )}
      {social.state.canModerate && (
        <section aria-label="Moderator review">
          <button
            onClick={() =>
              void action(async () => {
                setReports(await socialCall("/moderation"));
              })
            }
          >
            Review participant reports
          </button>
          {reports.map((r) => (
            <article key={r.id}>
              <p>
                {r.reason} · {r.resolved ? "resolved" : "pending"}
              </p>
              <button
                onClick={() =>
                  void action(async () => {
                    await socialCall("/moderation", {
                      targetId: r.target_id,
                      reportId: r.id,
                      action: "mute",
                    });
                    setReports(await socialCall("/moderation"));
                  })
                }
              >
                Mute signals for 24 hours
              </button>
              <button
                onClick={() =>
                  void action(async () => {
                    await socialCall("/moderation", {
                      targetId: r.target_id,
                      reportId: r.id,
                      action: "unmute",
                    });
                    setReports(await socialCall("/moderation"));
                  })
                }
              >
                Restore signals
              </button>
            </article>
          ))}
        </section>
      )}
      {(message || social.message) && (
        <p role="status">{message || social.message}</p>
      )}
    </section>
  );
}
