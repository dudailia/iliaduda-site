import { fact } from '@/content/facts'
import { SettlementLive } from './settlement/Live'

/**
 * Fig. 1 of the debt-portal paper. The arithmetic and the contact rules are
 * the portal's own; the discount ladder is illustrative, because the client's
 * real terms are a commercial decision that was never in the code.
 */
export function SettlementInstrument() {
  return (
    <SettlementLive
      callCaps={`Calls are a separate channel with separate caps — ${fact('dgCallsDay').value} a day, ${fact('dgCallsWeek').value} a week, ${fact('dgCallsMonth').value} a month — and the login path is forbidden by a build gate from importing them.`}
      caption={
        <>
          The calculator offers only terms worth choosing: at a step in the discount ladder a
          longer term would cost more a month, so that term is hidden (hollow). Every sum is in
          integer kopecks.
        </>
      }
      loginCaption={
        <>
          The login is an electronic message, so every code the debtor asks for can spend part of
          a legal allowance of {fact('dgMessagesDay').value} a day, {fact('dgMessagesWeek').value}{' '}
          a week and {fact('dgMessagesMonth').value} a month. The portal counts rolling windows,
          one contact per verification episode, and checks a refusal of interaction before any
          cap.
        </>
      }
      loginTable={
        <table>
          <caption>Messages a debtor may receive, by rolling window (230-FZ art. 7)</caption>
          <thead>
            <tr>
              <th scope="col">Window</th>
              <th scope="col">Messages allowed</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>24 hours</td>
              <td>{fact('dgMessagesDay').value}</td>
            </tr>
            <tr>
              <td>7 days</td>
              <td>{fact('dgMessagesWeek').value}</td>
            </tr>
            <tr>
              <td>30 days</td>
              <td>{fact('dgMessagesMonth').value}</td>
            </tr>
          </tbody>
        </table>
      }
    />
  )
}
