import { REPO, at, commitUrl, day } from '@/lib/toxicflow/data'
import { TAG, tagUrl, type PreregTag } from '@/lib/toxicflow/prereg'

/**
 * How the protocol is frozen, as the copied bundle records it: by the annotated tag once the public remote has it, and
 * drafted until then. Both states are rendered in tests/toxic-flow.test.ts.
 */

export function Frozen({ tag }: { tag: PreregTag | null }) {
  return (
    <p>
      <span className="text-ink">{tag ? 'The pre-registration.' : 'The pre-registration, drafted.'}</span>{' '}
      <a href={tag ? `${REPO}/blob/${tag.name}/PREREGISTRATION.md` : at('PREREGISTRATION.md')}>PREREGISTRATION.md</a> fixes
      the question, data, simulation, strategies, metric, hypotheses, analysis and the sentence the paper will print for
      each possible outcome, before any test day exists on disk.{' '}
      {tag ? (
        <>
          It is frozen by the annotated git tag <a href={tagUrl(REPO, tag)}>{tag.name}</a> on the public repository, made
          on {day(tag.tagged_at)} at commit <a href={commitUrl(tag.commit)}>{tag.commit.slice(0, 7)}</a>.
        </>
      ) : (
        <>
          It becomes binding when the annotated git tag {TAG} freezes it on the public repository. As of the commit this
          page reads, that tag is not created and the test days have not been downloaded; once it is pushed it is listed
          under <a href={`${REPO}/tags`}>the repository’s tags</a>, with GitHub’s record of when, and this page links to it.
        </>
      )}{' '}
      After the tag, any change goes in <a href={at('DEVIATIONS.md')}>DEVIATIONS.md</a>, and both the original and the
      changed analysis are reported.
    </p>
  )
}

/** The tag's row in the page's Meta block. */
export function TagLink({ tag }: { tag: PreregTag | null }) {
  return tag ? <a href={tagUrl(REPO, tag)}>{`${tag.name}, ${day(tag.tagged_at)}`}</a> : <a href={`${REPO}/tags`}>{`${TAG}, not yet created`}</a>
}
