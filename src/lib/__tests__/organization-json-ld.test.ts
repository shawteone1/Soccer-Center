import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('organization-json-ld', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  function mockJsonConfig(urls: string[]): void {
    vi.doMock('../../config/same-as.json', () => ({
      default: { urls },
    }))
  }

  async function loadModule(): Promise<typeof import('../organization-json-ld')> {
    return import('../organization-json-ld')
  }

  describe('getSameAsUrls', () => {
    it('returns empty array when config has no URLs', async function emptyConfig() {
      mockJsonConfig([])
      const { getSameAsUrls } = await loadModule()
      expect(getSameAsUrls()).toEqual([])
    })

    it('returns URLs from config', async function withUrls() {
      mockJsonConfig(['https://www.facebook.com/acme'])
      const { getSameAsUrls } = await loadModule()
      expect(getSameAsUrls()).toEqual(['https://www.facebook.com/acme'])
    })
  })

  describe('buildOrganizationNode', () => {
    it('omits sameAs when config has no URLs', async function omitsSameAs() {
      mockJsonConfig([])
      const { buildOrganizationNode } = await loadModule()
      const node = buildOrganizationNode({ siteUrl: 'https://example.com', name: 'Acme' })
      expect(node.sameAs).toBeUndefined()
    })

    it('includes sameAs when config has URLs', async function includesSameAs() {
      mockJsonConfig(['https://www.facebook.com/acme', 'https://www.instagram.com/acme/'])
      const { buildOrganizationNode } = await loadModule()
      const node = buildOrganizationNode({ siteUrl: 'https://example.com', name: 'Acme' })
      expect(node.sameAs).toEqual([
        'https://www.facebook.com/acme',
        'https://www.instagram.com/acme/',
      ])
    })
  })

  describe('buildHomepageSameAsJsonLdDocument', () => {
    it('returns baseline Organization without sameAs when config has no URLs', async function emptyDocument() {
      mockJsonConfig([])
      const { buildHomepageSameAsJsonLdDocument } = await loadModule()
      const result = buildHomepageSameAsJsonLdDocument({
        siteUrl: 'https://example.com',
        organizationName: 'Acme',
      })

      expect(result['@context']).toBe('https://schema.org')
      expect(result['@type']).toBe('Organization')
      expect(result.name).toBe('Acme')
      expect(result.sameAs).toBeUndefined()
    })

    it('returns Organization JSON-LD with sameAs when urls exist', async function withDocument() {
      mockJsonConfig(['https://www.linkedin.com/company/acme'])
      const { buildHomepageSameAsJsonLdDocument } = await loadModule()
      const result = buildHomepageSameAsJsonLdDocument({
        siteUrl: 'https://example.com',
        organizationName: 'Acme Corp',
      })

      expect(result?.['@context']).toBe('https://schema.org')
      expect(result?.['@type']).toBe('Organization')
      expect(result?.name).toBe('Acme Corp')
      expect(result?.sameAs).toEqual(['https://www.linkedin.com/company/acme'])
    })
  })

  describe('buildHomepageJsonLd', () => {
    it('emits @graph with WebSite, Organization, and WebPage nodes', async function graphStructure() {
      mockJsonConfig([])
      const { buildHomepageJsonLd } = await loadModule()
      const result = buildHomepageJsonLd({
        siteUrl: 'https://example.com',
        organizationName: 'Acme Corp',
        datePublished: '2024-01-01',
        dateModified: '2024-01-02',
      })

      expect(result['@context']).toBe('https://schema.org')
      const graph = result['@graph'] as Record<string, unknown>[]
      expect(graph).toHaveLength(3)
      expect(graph[0]['@type']).toBe('WebSite')
      expect(graph[1]['@type']).toBe('Organization')
      expect(graph[2]['@type']).toBe('WebPage')
    })
  })
})
