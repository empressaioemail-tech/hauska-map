import { useState } from 'react'

interface AtomData {
  did?: string
  typed?: {
    data?: {
      codebook?: { title?: string }
      ordinal?: string
      bodyText?: string
      verbatimTextDeepLink?: string
      sourceAdapter?: string
      fetchedAt?: string
      confidence?: number
    }
  }
  codebook?: { title?: string }
  ordinal?: string
  bodyText?: string
  verbatimTextDeepLink?: string
  sourceAdapter?: string
  fetchedAt?: string
  confidence?: number
}

interface SearchResponse {
  atoms?: AtomData[]
  error?: string
  missing?: string
}

type AppState = 'idle' | 'loading' | 'results' | 'zero-results' | 'proxy-unconfigured' | 'upstream-error'

function App() {
  const [query, setQuery] = useState('')
  const [state, setState] = useState<AppState>('idle')
  const [results, setResults] = useState<AtomData[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [queryCount, setQueryCount] = useState(0)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setState('loading')
    setErrorMessage('')
    setQueryCount((c) => c + 1)

    try {
      const response = await fetch(`/api/icc?path=search&q=${encodeURIComponent(query)}&limit=10`)
      const data: SearchResponse = await response.json()

      if (response.status === 503 && data.missing) {
        setState('proxy-unconfigured')
        setErrorMessage(data.missing)
        return
      }

      if (!response.ok) {
        setState('upstream-error')
        setErrorMessage(data.error || `HTTP ${response.status}`)
        return
      }

      if (!data.atoms || data.atoms.length === 0) {
        setState('zero-results')
        setResults([])
        return
      }

      setState('results')
      setResults(data.atoms)
    } catch (err) {
      setState('upstream-error')
      setErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }

  const getAtomField = (atom: AtomData, field: string): any => {
    const typedData = atom.typed?.data
    if (typedData && field in typedData) {
      return (typedData as any)[field]
    }
    return (atom as any)[field]
  }

  const formatCitation = (atom: AtomData): string => {
    const codebook = getAtomField(atom, 'codebook')
    const ordinal = getAtomField(atom, 'ordinal')
    const title = codebook?.title || 'Unknown Code'
    return `${title} Section ${ordinal || 'N/A'}`
  }

  return (
    <div className="app">
      <header>
        <h1>Codex — ICC Model Codes</h1>
        <p className="explainer">
          Cited building-code reasoning over the 2018 IBC and 2018 IPMC via ICC Code Connect
        </p>
      </header>

      <main>
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search building codes..."
            className="search-input"
            disabled={state === 'loading'}
          />
          <button type="submit" disabled={state === 'loading' || !query.trim()}>
            {state === 'loading' ? 'Searching...' : 'Search'}
          </button>
        </form>

        <div className="usage-strip">
          Queries this session: {queryCount} • Usage is metered per query at the gate
        </div>

        {state === 'loading' && (
          <div className="status-message">Loading...</div>
        )}

        {state === 'zero-results' && (
          <div className="status-message">No results found for "{query}"</div>
        )}

        {state === 'proxy-unconfigured' && (
          <div className="status-message error">
            Proxy not configured (missing: {errorMessage})
          </div>
        )}

        {state === 'upstream-error' && (
          <div className="status-message error">
            Upstream error: {errorMessage}
          </div>
        )}

        {state === 'results' && (
          <div className="results">
            {results.map((atom, idx) => {
              const bodyText = getAtomField(atom, 'bodyText')
              const deepLink = getAtomField(atom, 'verbatimTextDeepLink')
              const sourceAdapter = getAtomField(atom, 'sourceAdapter')
              const fetchedAt = getAtomField(atom, 'fetchedAt')
              const confidence = getAtomField(atom, 'confidence')
              const did = atom.did || 'unknown'

              return (
                <div key={`${did}-${idx}`} className="result-card">
                  <h3 className="citation">{formatCitation(atom)}</h3>
                  <p className="body-text">{bodyText || '(no body text)'}</p>
                  {deepLink && (
                    <a href={deepLink} target="_blank" rel="noopener noreferrer" className="icc-link">
                      View official text at ICC →
                    </a>
                  )}
                  <div className="provenance">
                    {sourceAdapter && <span>Source: {sourceAdapter}</span>}
                    {fetchedAt && <span>Fetched: {new Date(fetchedAt).toLocaleString()}</span>}
                    <span>DID: {did}</span>
                    {confidence !== undefined && <span>Confidence: {confidence}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      <footer>
        <p>Model code content © International Code Council; full text served at codes.iccsafe.org</p>
        <p>Powered by Hauska Engine — hauska.dev</p>
      </footer>
    </div>
  )
}

export default App
