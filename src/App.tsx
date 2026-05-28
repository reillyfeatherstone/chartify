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
}

type UserToken =
  | {
      accessToken: string
      refreshToken: string
      expiresAt: number
    }
  | undefined

function App() {
  const [songs, setSongs] = useState<Song[]>([])
  const [editingSong, setEditingSong] = useState<Song | null>(null)
  const [playlistName, setPlaylistName] = useState('')
  const [showSettings, setShowSettings] = useState(true)
  const [spotifyAPIAccess, setSpotifyAPIAccess] =
    useState<SpotifyAPIAccess | null>(null)
  const [validating, setValidating] = useState({ id: 0, validating: false })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    chrome.storage.local.get(['spotifyAPIAccess', 'userToken'], (result) => {
      if (result.spotifyAPIAccess && result.userToken) {
        setSpotifyAPIAccess(result.spotifyAPIAccess as SpotifyAPIAccess)
        setShowSettings(false)
      } else {
        setShowSettings(true)
      }
    })
  }, [])

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

  async function getAccessToken() {
    const result = await chrome.storage.local.get(['userToken'])
    const existing = result.userToken as UserToken

    if (!existing || !spotifyAPIAccess) {
      setShowSettings(true)
      throw new Error('No token available, please log in again')
    }

    if (Date.now() < existing.expiresAt) {
      return existing.accessToken
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: existing.refreshToken,
        client_id: spotifyAPIAccess.spotifyClientID,
      }),
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error)

    chrome.storage.local.set({
      userToken: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? existing.refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000,
      },
    })

    return data.access_token
  }

  async function validateSongs() {
    const accessToken = await getAccessToken()

    try {
      const url = 'https://api.spotify.com/v1/search?q='
      const market = 'GB'

      let updatedSongs = [...songs]

      for (const song of songs) {
        setValidating({ id: song.rank, validating: true })
        const raw = `${song.name} ${song.artist}`
        const query = encodeURIComponent(raw)
        const fullUrl = `${url}${query}&type=track&market=${market}&limit=1`
        const response = await fetch(fullUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        if (!response.ok) {
          if (response.status === 401) {
            alert('Bad or expired token')
          } else if (response.status === 429) {
            alert('Rate limit exceeded. Please try again later.')
          } else {
            alert('An error occurred while validating songs')
          }
          return songs
        }

        const data = await response.json()
        const trackUri = data.tracks.items[0]?.uri ?? ''
        updatedSongs = updatedSongs.map((s) =>
          s.rank === song.rank ? { ...s, spotifyUri: trackUri } : s,
        )
        setValidating({ id: song.rank, validating: false })
        setSongs(updatedSongs)
        chrome.storage.local.set({ songs: updatedSongs })
      }
      return updatedSongs
    } catch {
      alert('An unknown error occurred')
      return songs
    }
  }

  async function createPlaylist(playlistName: string) {
    setIsLoading(true)
    const accessToken = await getAccessToken()

    let validatedSongs = songs

    if (songs.some((s) => !s.spotifyUri)) {
      validatedSongs = await validateSongs()
    }

    try {
      const result = await fetch('https://api.spotify.com/v1/me/playlists', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: playlistName,
          description: 'Created with Chartify',
          public: false,
        }),
      })

      const playlist = await result.json()

      if (!result.ok) {
        if (playlist.error.message === 'Missing required field: name') {
          setError('Enter a playlist name')
        } else {
          setError(playlist.error.message)
        }
      } else {
        try {
          await addSongsToPlaylist(accessToken, playlist.id, validatedSongs)
          setError('')
          setSuccess(`Playlist "${playlistName}" created successfully!`)
        } catch {
          setError(
            `Playlist "${playlistName}" created, but unable to add all of the songs.`,
          )
        }
      }
    } catch {
      setError(
        'An unknown error occurred while creating the playlist. Try again later.',
      )
    }
    setIsLoading(false)
  }

  async function addSongsToPlaylist(
    accessToken: string,
    playlist: string,
    songs: Song[],
  ) {
    const uris = songs
      .filter((s) => s.spotifyUri)
      .map((s) => s.spotifyUri as string)

    try {
      const result = await fetch(
        `https://api.spotify.com/v1/playlists/${playlist}/items`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uris,
            position: 0,
          }),
        },
      )

      if (!result.ok) {
        const data = await result.json()
        throw new Error(data.error?.message || 'Failed to add songs')
      }
    } catch (error) {
      return error
    }
  }

  return !showSettings && spotifyAPIAccess ? (
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

            {error && (
              <div className="mb-4 p-2 bg-red-100 border-l-4 border-red-500">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-4 p-2 bg-green-100 border-l-4 border-green-500">
                <p className="text-green-700 text-sm">{success}</p>
              </div>
            )}

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Playlist Name
            </label>
            <div className="flex gap-2 h-9">
              <input
                value={playlistName}
                onChange={(e) => handlePlaylistName(e.target.value)}
                className={`h-9 w-full border rounded px-2 py-0.5 text-sm ${
                  error === 'Enter a playlist name' ? 'border-red-500' : ''
                }`}
                placeholder="Enter playlist name"
              />
              <button
                onClick={() => createPlaylist(playlistName)}
                className="h-9 px-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm hover:cursor-pointer flex items-center gap-2"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CirclePlus className="w-4 h-4" />
                )}
                Chartify
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
  const [error, setError] = useState('')
  const [clientIdLock, setClientIdLock] = useState(true)

  useEffect(() => {
    chrome.storage.local.get(['spotifyAPIAccess'], (result) => {
      const spotifyAPIAccess = result.spotifyAPIAccess as
        | SpotifyAPIAccess
        | undefined
      if (spotifyAPIAccess) {
        setClientId(spotifyAPIAccess.spotifyClientID)
      } else {
        setClientIdLock(false)
      }
    })
  }, [])

  function generateRandomString(length: number) {
    const possible =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const values = crypto.getRandomValues(new Uint8Array(length))
    return values.reduce((acc, x) => acc + possible[x % possible.length], '')
  }

  const sha256 = async (plain: string) => {
    const encoder = new TextEncoder()
    const data = encoder.encode(plain)
    return window.crypto.subtle.digest('SHA-256', data)
  }

  const base64encode = (input: ArrayBuffer) => {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  }

  async function getUserToken(clientId: string) {
    const redirectUri = chrome.identity.getRedirectURL()

    const scopes = 'playlist-modify-private playlist-modify-public'

    const codeVerifier = generateRandomString(64)
    const hashed = await sha256(codeVerifier)
    const codeChallenge = base64encode(hashed)

    // const scope = 'use-read-private user-read-email'
    const authUrl = new URL('https://accounts.spotify.com/authorize')
    const params = {
      response_type: 'code',
      client_id: clientId,
      scope: scopes,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      redirect_uri: redirectUri,
    }

    authUrl.search = new URLSearchParams(params).toString()

    return new Promise<string>((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl.toString(), interactive: true },
        async (redirectUrl) => {
          if (!redirectUrl) return reject('No redirect URL')

          const code = new URL(redirectUrl).searchParams.get('code')
          if (!code) return reject('No code in redirect URL')

          const response = await fetch(
            'https://accounts.spotify.com/api/token',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                client_id: clientId,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                code_verifier: codeVerifier,
              }),
            },
          )

          const data = await response.json()
          if (!response.ok) return reject(data.error)

          chrome.storage.local.set({
            userToken: {
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
              expiresAt: Date.now() + data.expires_in * 1000,
            },
          })
          resolve(data.access_token)
        },
      )
    })
  }

  async function handleSave() {
    if (!clientId) {
      setError('Please enter a client ID')
      return
    }

    try {
      await getUserToken(clientId)
    } catch {
      setError('Failed to authenticate with Spotify')
      return
    }

    const access = {
      spotifyClientID: clientId,
    }
    chrome.storage.local.set({ spotifyAPIAccess: { ...access } })
    onSave(access)
    onBack()
  }

  function handleDelete() {
    chrome.storage.local.remove(['spotifyAPIAccess'], () => {
      setClientId('')
      setClientIdLock(false)
      onSave({ spotifyClientID: '' })
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
          <div className="relative">
            <input
              value={clientId}
              disabled={clientIdLock}
              onChange={(e) => {
                setClientId(e.target.value)
              }}
              onSubmit={(e) => {
                chrome.storage.local.set({
                  spotifyAPIAccess: {
                    spotifyClientID: e.target.value,
                  },
                })
              }}
              className="w-full border rounded px-2 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50"
              placeholder="Spotify Client ID"
            />
            {clientIdLock ? (
              <button
                onClick={() => setClientIdLock(false)}
                className="absolute right-4 top-1/2 -translate-y-1/2 hover:cursor-pointer"
              >
                <PencilIcon className="w-4 h-4 text-gray-400 hover:text-gray-600" />
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-gray-500">
            Create an API client ID using{' '}
            <a
              href="https://developer.spotify.com/dashboard/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-900 underline underline-offset-1"
            >
              Spotify's Developer Dashboard
            </a>
          </p>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          onClick={handleSave}
          disabled={!clientId}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
        <button
          onClick={handleDelete}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Remove API Details
        </button>
      </div>
    </div>
  )
}

export default App
