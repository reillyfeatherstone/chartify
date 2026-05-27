/// <reference types="chrome" />
import { useEffect, useState } from 'react'
import { extractChartData } from './content'
import type { Song } from './content'
import {
  CheckIcon,
  CirclePlus,
  CogIcon,
  Loader2,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'

type SpotifyAPIAccess = {
  spotifyClientID: string
  spotifyClientSecret: string
  valid: boolean
}

function App() {
  const [songs, setSongs] = useState<Song[]>([])
  const [editingSong, setEditingSong] = useState<Song | null>(null)
  const [playlistName, setPlaylistName] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [spotifyAPIAccess, setSpotifyAPIAccess] =
    useState<SpotifyAPIAccess | null>(null)
  const [validating, setValidating] = useState({ id: 0, validating: false })

  useEffect(() => {
    chrome.storage.session.get(['spotifyAPIAccess'], (result) => {
      if (result.spotifyAPIAccess) {
        setSpotifyAPIAccess(result.spotifyAPIAccess as SpotifyAPIAccess)
      } else {
        setShowSettings(true)
      }
    })
  })

  useEffect(() => {
    chrome.storage.local.get(['songs'], (result) => {
      if (Array.isArray(result.songs)) {
        setSongs(result.songs as Song[])
      }
    })

    chrome.storage.local.get(['playlistName'], (result) => {
      if (typeof result.playlistName === 'string') {
        setPlaylistName(result.playlistName)
      }
    })
  }, [])

  function getTabId() {
    return new Promise<number>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0].id!)
      })
    })
  }

  async function handleGetSongs() {
    const results = await chrome.scripting.executeScript({
      target: { tabId: await getTabId() },
      func: extractChartData,
    })
    setSongs(results[0].result || [])
    chrome.storage.local.set({ songs: results[0].result || [] })
  }

  function handleEdit(rank: number) {
    const song = songs.find((s) => s.rank === rank)
    setEditingSong({
      rank,
      name: song?.name || '',
      artist: song?.artist || '',
      spotifyUri: song?.spotifyUri || undefined,
    })
  }

  function saveEdit(rank: number) {
    if (!editingSong) return

    const updatedSongs = songs.map((song) =>
      song.rank === rank ? editingSong : song,
    )
    setSongs(updatedSongs)
    chrome.storage.local.set({ songs: updatedSongs })
    setEditingSong(null)
  }

  function handlePlaylistName(playlistName: string) {
    setPlaylistName(playlistName)
    chrome.storage.local.set({ playlistName })
  }

  function handleReset() {
    setEditingSong(null)
    setSongs([])
    setPlaylistName('')
    chrome.storage.local.set({ songs: [], playlistName: '' })
  }

  async function validateSongs() {
    try {
      if (
        !spotifyAPIAccess?.spotifyClientID ||
        !spotifyAPIAccess?.spotifyClientSecret
      ) {
        return false
      }

      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: spotifyAPIAccess.spotifyClientID,
          client_secret: spotifyAPIAccess.spotifyClientSecret,
        }),
      })
      const { access_token } = await tokenRes.json()

      const url = 'https://api.spotify.com/v1/search?q='
      const market = 'GB'

      let updatedSongs = [...songs]

      for (const song of songs) {
        setValidating({ id: song.rank, validating: true })
        const raw = `${song.name} ${song.artist}`
        const query = encodeURIComponent(raw)
        const fullUrl = `${url}${query}&type=track&market=${market}&limit=1`
        const response = await fetch(fullUrl, {
          headers: { Authorization: `Bearer ${access_token}` },
        })

        if (!response.ok) {
          if (response.status === 401) {
            alert('Bad or expired token')
          } else if (response.status === 429) {
            alert('Rate limit exceeded. Please try again later.')
          } else {
            alert('An error occurred while validating songs')
          }
          return
        }

        const data = await response.json()
        const trackUrl = data.tracks.items[0]?.external_urls?.spotify ?? ''
        updatedSongs = updatedSongs.map((s) =>
          s.rank === song.rank ? { ...s, spotifyUri: trackUrl } : s,
        )
        setSongs(updatedSongs)
        setValidating({ id: song.rank, validating: false })
        chrome.storage.local.set({ songs: updatedSongs })
      }
    } catch {
      alert('An unknown error occurred')
    }
  }

  return !showSettings &&
    spotifyAPIAccess &&
    spotifyAPIAccess.valid === true ? (
    <div className="w-100 p-8 max-w-xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Chartify</h1>
        <button onClick={() => setShowSettings(true)}>
          <CogIcon className="w-5 h-5 text-gray-800 hover:cursor-pointer" />
        </button>
      </div>
      <div className="flex justify-between">
        <button
          onClick={() => handleReset()}
          className="mb-6 px-4 py-2 border text-black rounded hover:bg-gray-100 text-sm hover:cursor-pointer"
        >
          Reset
        </button>
        <button
          onClick={() => handleGetSongs()}
          className="mb-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm hover:cursor-pointer"
        >
          Get Songs
        </button>
      </div>
      {songs.length === 0 ? (
        <p className="text-gray-500">
          No songs found. Try on an{' '}
          <a
            href="https://www.officialcharts.com/charts/singles-chart/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-900 underline underline-offset-1"
          >
            Official Charts
          </a>{' '}
          page.
        </p>
      ) : (
        <div>
          <div className="mb-4">
            {songs.some((s) => s.spotifyUri) && (
              <div className="mb-4 p-2 bg-yellow-100 border-l-4 border-yellow-500">
                <p className="text-yellow-700 text-sm">
                  {songs.filter((s) => s.spotifyUri).length} out of{' '}
                  {songs.length} songs are valid.
                </p>
              </div>
            )}

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Playlist Name
            </label>
            <div className="flex gap-2 h-9">
              <input
                value={playlistName}
                onChange={(e) => handlePlaylistName(e.target.value)}
                className="h-9 w-full border rounded px-2 py-0.5 text-sm"
                placeholder="Enter playlist name"
              />
              <button
                onClick={() => validateSongs()}
                className="h-9 px-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm hover:cursor-pointer flex items-center gap-2"
              >
                <CirclePlus className="w-4 h-4" /> Chartify
              </button>
            </div>
          </div>
          <ul className="divide-y divide-gray-200">
            {songs.map((song, i) => (
              <li
                key={i}
                className="py-3 flex items-center justify-between gap-2"
              >
                <div className="flex items-start gap-2">
                  <p className="font-bold">{i + 1}.</p>

                  {editingSong?.rank === song.rank ? (
                    <div className="flex flex-col gap-1 flex-1">
                      <input
                        className="border rounded px-2 py-0.5 text-sm font-semibold w-full"
                        value={editingSong.name}
                        onChange={(e) =>
                          setEditingSong({
                            ...editingSong,
                            name: e.target.value,
                          })
                        }
                      />
                      <input
                        className="border rounded px-2 py-0.5 text-sm text-gray-500 w-full"
                        value={editingSong.artist}
                        onChange={(e) =>
                          setEditingSong({
                            ...editingSong,
                            artist: e.target.value,
                          })
                        }
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <p className="font-semibold">{song.name}</p>
                      <p className="text-gray-500 text-sm">{song.artist}</p>
                    </div>
                  )}
                </div>

                <div className="flex">
                  {song.spotifyUri ? (
                    <div className="p-2">
                      <CheckIcon className="w-4 h-4 text-green-500" />
                    </div>
                  ) : song.spotifyUri === '' ? (
                    <div className="p-2">
                      <p className="text-red-500 text-xs">
                        <XIcon className="w-4 h-4 inline-block" />
                      </p>
                    </div>
                  ) : validating.id === song.rank && validating.validating ? (
                    <div className="p-2">
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    </div>
                  ) : editingSong?.rank === song.rank ? (
                    <button
                      onClick={() => saveEdit(song.rank)}
                      className="p-2 rounded-md hover:bg-blue-100 transition hover:cursor-pointer"
                    >
                      <CheckIcon className="w-4 h-4 text-blue-600 hover:text-blue-900" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleEdit(song.rank)}
                      className="p-2 rounded-md hover:bg-gray-100 transition hover:cursor-pointer"
                    >
                      <PencilIcon className="w-4 h-4 text-gray-600 hover:text-gray-900" />
                    </button>
                  )}

                  <button
                    onClick={() =>
                      setSongs((prev) => {
                        const updated = prev.filter((_, index) => index !== i)
                        chrome.storage.local.set({ songs: updated })
                        return updated
                      })
                    }
                    className="p-2 rounded-md hover:bg-red-50 transition hover:cursor-pointer"
                  >
                    <Trash2Icon className="w-5 h-5 text-red-500" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  ) : (
    <SpotifyAccess
      onSave={(access) => setSpotifyAPIAccess(access)}
      onBack={() => setShowSettings(false)}
    />
  )
}

function SpotifyAccess({
  onSave,
  onBack,
}: {
  onSave: (access: SpotifyAPIAccess) => void
  onBack: () => void
}) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    chrome.storage.session.get(['spotifyAPIAccess'], (result) => {
      const spotifyAPIAccess = result.spotifyAPIAccess as
        | SpotifyAPIAccess
        | undefined
      if (spotifyAPIAccess) {
        setClientId(spotifyAPIAccess.spotifyClientID)
        setClientSecret(spotifyAPIAccess.spotifyClientSecret)
      }
    })
  }, [])

  async function handleSave() {
    if (!clientId || !clientSecret) return
    const access = {
      spotifyClientID: clientId,
      spotifyClientSecret: clientSecret,
      valid: false,
    }
    try {
      const response = await checkApiDetails(access)
      if (!response.success) {
        chrome.storage.session.set({
          spotifyAPIAccess: {
            spotifyClientID: '',
            spotifyClientSecret: '',
            valid: false,
          },
        })
        setClientId('')
        setClientSecret('')
        setError(response.error || 'Invalid Spotify API details')
        return
      }
    } catch {
      chrome.storage.session.set({
        spotifyAPIAccess: {
          spotifyClientID: '',
          spotifyClientSecret: '',
          valid: false,
        },
      })
      setClientId('')
      setClientSecret('')
      setError('Invalid Spotify API details')
      return
    }

    chrome.storage.session.set({ spotifyAPIAccess: { ...access, valid: true } })
    onSave(access)
    onBack()
  }

  async function checkApiDetails(access: SpotifyAPIAccess) {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: access.spotifyClientID,
      client_secret: access.spotifyClientSecret,
    })

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })

    if (!response.ok) {
      return { success: false, error: 'Invalid Spotify API details' }
    }

    return { success: true }
  }

  function handleDelete() {
    chrome.storage.session.remove(['spotifyAPIAccess'], () => {
      setClientId('')
      setClientSecret('')
      onSave({ spotifyClientID: '', spotifyClientSecret: '', valid: false })
    })
  }

  return (
    <div className="w-100 p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Chartify</h1>
      <p className="text-gray-500 text-sm mb-6">
        Enter your Spotify API Access to get started.
      </p>
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Client ID
          </label>
          <input
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value)
              chrome.storage.session.set({
                spotifyAPIAccess: {
                  spotifyClientID: e.target.value,
                  spotifyClientSecret: clientSecret,
                },
              })
            }}
            className="w-full border rounded px-2 py-1.5 text-sm"
            placeholder="Spotify Client ID"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Client Secret
          </label>
          <input
            value={clientSecret}
            onChange={(e) => {
              setClientSecret(e.target.value)
              chrome.storage.session.set({
                spotifyAPIAccess: {
                  spotifyClientID: clientId,
                  spotifyClientSecret: e.target.value,
                },
              })
            }}
            className="w-full border rounded px-2 py-1.5 text-sm"
            type="password"
            placeholder="Spotify Client Secret"
          />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          onClick={handleSave}
          disabled={!clientId || !clientSecret}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
        <button
          onClick={handleDelete}
          disabled={!clientId && !clientSecret}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Remove API Details
        </button>
      </div>
    </div>
  )
}

export default App
