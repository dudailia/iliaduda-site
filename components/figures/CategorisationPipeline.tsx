import { fact } from '@/content/facts'
import { chart, feed, remap } from '@/content/data/closebooks-feed'
import { categorise } from '@/lib/closebooks'
import { CategorisationLive } from './closebooks/Live'

/**
 * Fig. 1 of the CloseBooks paper: a synthetic bank feed run through the real
 * post-model rules. The server renders every row settled, so the figure reads
 * before any script; the client plays the batch arriving once, then hands the
 * reviewer's buttons to the reader.
 */
export function CategorisationPipeline() {
  const results = feed.map((l) => categorise(l, chart))
  return (
    <CategorisationLive
      chart={chart}
      feed={feed}
      remap={remap}
      threshold={fact('cbThreshold').value}
      caption={
        <>
          The model&rsquo;s confidence is an input, not a verdict. It is taken down for amounts
          under ${fact('cbSmallAmount').value}, capped when a description is too short to carry
          information, and capped again when the suggested account does not exist in this
          client&rsquo;s chart or posts in the wrong direction. Only an unflagged row at or above{' '}
          {fact('cbThreshold').value} is approved by the rules; nothing waiting or blocked can be
          exported.
        </>
      }
      table={
        <table>
          <caption>Each synthetic line, the account suggested, the confidence after the rules, and the status</caption>
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col">Suggested account</th>
              <th scope="col">Stated confidence</th>
              <th scope="col">After the rules</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {feed.map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td>
                <td>{`${l.suggested.code} ${l.suggested.name}`}</td>
                <td>{l.stated.toFixed(2)}</td>
                <td>{results[i]!.confidence.toFixed(2)}</td>
                <td>{results[i]!.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}
