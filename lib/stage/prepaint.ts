/**
 * The inline script a live figure puts before its first paint, so the first
 * frame is already the right one. When this visit will play the figure's
 * signature — not yet seen this session, motion allowed, WebGL2 present, data
 * not being saved — it marks `<html data-{name}-seq>`, and the page's CSS hides
 * what the signature will reveal, so the reader sees the stage it starts from.
 * A visit that can never go live is marked `data-{name}-still`. If the live
 * figure never takes over (its bundle failed), the mark is dropped after 8 s
 * and the finished picture shows. `name` is one lowercase word.
 */
export function prepaint(name: string, { webgl = true }: { webgl?: boolean } = {}): string {
  if (!/^[a-z]+$/.test(name)) throw new Error(`prepaint: "${name}" must be one lowercase word`)
  // A figure drawn without WebGL (a replay in SVG) plays wherever motion is welcome; a WebGL one needs WebGL2 and a
  // reader not saving data.
  const needs = webgl ? `||!('WebGL2RenderingContext' in window)||!!(navigator.connection&&navigator.connection.saveData)` : ''
  return `try{var d=document.documentElement;var still=matchMedia('(prefers-reduced-motion: reduce)').matches${needs};if(still)d.dataset.${name}Still='1';else if(!sessionStorage.getItem('${name}-seq')){d.dataset.${name}Seq='1';setTimeout(function(){if(!d.dataset.${name}Live)delete d.dataset.${name}Seq},8000)}}catch(e){}`
}
