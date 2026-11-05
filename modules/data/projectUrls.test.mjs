import { describe, expect, it } from 'vitest'
import { projectUrlsFromHtml, resolveProjectUrls } from './projectUrls.mjs'

const PALETTE_HTML = `<!DOCTYPE html>
<html><body>
  <p><a href="https://github.com/sbecker11/color-palette-maker">GitHub</a></p>
  <p><a href="https://sbecker11.github.io/color-palette-maker/">GitHub Pages</a></p>
</body></html>`

describe('projectUrlsFromHtml', () => {
  it('reads the GitHub repo URL and the GitHub Pages URL from HTML', () => {
    expect(projectUrlsFromHtml(PALETTE_HTML)).toEqual({
      githubRepoUrl: 'https://github.com/sbecker11/color-palette-maker',
      githubPagesUrl: 'https://sbecker11.github.io/color-palette-maker/',
    })
  })

  it('prefers explicit job fields over description text', () => {
    expect(resolveProjectUrls({
      githubRepoUrl: 'https://github.com/sbecker11/color-palette-maker',
      githubPagesUrl: 'https://sbecker11.github.io/color-palette-maker/',
      Description: 'no links here',
    })).toEqual({
      githubRepoUrl: 'https://github.com/sbecker11/color-palette-maker',
      githubPagesUrl: 'https://sbecker11.github.io/color-palette-maker/',
    })
  })
})
