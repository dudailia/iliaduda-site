import { fact } from '@/content/facts'
import replay from '@/content/data/cricket-final.json'
import { CricketLive, type Ball } from './cricket/Live'

/**
 * Fig. 1 of the cricstate paper: the 2026 Men's T20 World Cup final, replayed
 * with the leaderboard model's own calibrated win probability.
 *
 * The data is content/data/cricket-final.json, written by
 * scripts/cricket_replay.py from the cricstate repository: the cached
 * train-only B3 model, the isotonic map refit on validation exactly as the
 * leaderboard run does, and an assertion that the whole test cell reproduces
 * the published NLL before a single ball is exported. The match was chosen by
 * a rule fixed before any prediction was looked at.
 */

type Row = (typeof replay.balls)[number]

export function CricketReplay() {
  const { match, balls } = replay
  const first = match.battingFirst
  const second = match.teams.find((t) => t !== first)!
  const inn1 = balls.filter((b: Row) => b.inn === 1)
  const inn2 = balls.filter((b: Row) => b.inn === 2)
  const last1 = inn1.at(-1)!
  const last2 = inn2.at(-1)!
  const total1 = last1.runs + last1.outRuns
  const total2 = last2.runs + last2.outRuns
  const wk1 = last1.wkts + last1.outWkts
  const won = match.winner === first
  const margin = won ? `${first} won by ${total1 - total2} runs` : `${second} won`

  const data: Ball[] = balls.map((b: Row) => [b.inn, b.over, b.ball, b.runs, b.wkts, b.legal, b.target ?? 0, b.outRuns, b.outWkts, b.p])
  const pAt = (i: number) => balls[i]!.p
  const peakLow = Math.min(...balls.map((b: Row) => b.p))

  const description =
    `Win probability for ${first}, the side batting first, before each of the ${balls.length} balls of the final. ` +
    `It opens at ${(pAt(0) * 100).toFixed(0)}%, ${first} make ${total1} for ${wk1}, and by the start of the chase the model gives them ` +
    `${(pAt(inn1.length) * 100).toFixed(0)}%. The lowest it goes is ${(peakLow * 100).toFixed(0)}%. ` +
    `${second} are all out for ${total2}; ${margin}.`

  return (
    <CricketLive
      balls={data}
      maxBalls={balls[0]!.max}
      first={first}
      second={second}
      result={margin}
      description={description}
      caption={
        <>
          The model has seen nothing from this match or anything after it: it is the train-only
          leaderboard model, calibrated on the validation period, scoring a match from the
          held-out test period, which begins on 30 August 2025. The match was chosen by a rule
          fixed first — the tournament&rsquo;s final — not for the shape of its curve. On the
          whole test period the same model reaches {fact('crT2Skill').value}% skill over the
          base rate.
        </>
      }
      table={
        <table>
          <caption>{`Probability ${first} wins, at the start of every over`}</caption>
          <thead>
            <tr>
              <th scope="col">Innings</th>
              <th scope="col">Over</th>
              <th scope="col">Score</th>
              <th scope="col">Probability</th>
            </tr>
          </thead>
          <tbody>
            {balls
              .filter((b: Row) => b.ball === 1)
              .map((b: Row) => (
                <tr key={`${b.inn}-${b.over}`}>
                  <td>{b.inn}</td>
                  <td>{b.over}</td>
                  <td>{`${b.runs}/${b.wkts}`}</td>
                  <td>{`${(b.p * 100).toFixed(1)}%`}</td>
                </tr>
              ))}
          </tbody>
        </table>
      }
    />
  )
}
