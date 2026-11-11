import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

const { sameAsConfig, siteMeta } = vi.hoisted(() => ({
  sameAsConfig: { urls: ['https://www.linkedin.com/company/acme'] },
  siteMeta: { name: 'Acme', summary: '' },
}))

vi.mock('./config/same-as.json', () => ({
  default: sameAsConfig,
}))

vi.mock('./lib/site-meta', () => ({
  siteMeta,
}))

vi.mock('./routes', () => ({
  routes: [{ path: '/', element: <main>Home</main> }],
}))

vi.mock('./layouts/Website', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('./layouts/parts/Header', () => ({ default: () => null }))
vi.mock('./layouts/parts/Footer', () => ({ default: () => null }))

import { render } from './entry-server'

describe('entry-server', () => {
  beforeEach(() => {
    sameAsConfig.urls = ['https://www.linkedin.com/company/acme']
    siteMeta.name = 'Acme'
  })

  it('emits homepage sameAs JSON-LD with the published origin', async () => {
    const result = await render('/', 'https://published.example')

    expect(result.status).toBe(200)
    expect(result.head).toContain('application/ld+json')
    expect(result.head).toContain('https://published.example/#organization')
    expect(result.head).toContain('https://www.linkedin.com/company/acme')
    expect(result.head).not.toContain('http://ssr')
  })

  it('escapes a closing-script breakout in sameAs JSON-LD', async () => {
    sameAsConfig.urls = ['https://example.com/</script><script>alert(1)</script>']

    const result = await render('/', 'https://published.example')

    expect(result.head).toContain('\\u003c/script>')
    expect(result.head).not.toContain('</script><script>alert(1)</script>')
  })

  it('uses the published hostname when the site name is empty', async () => {
    siteMeta.name = '   '

    const result = await render('/', 'https://published.example')

    expect(result.head).toContain('"name":"published.example"')
  })
})
