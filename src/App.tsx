/// <reference types="chrome" />
import { useEffect, useState } from 'react'
import { extractChartData } from './content'
import type { Song } from './content'
import { CheckIcon, CirclePlus, PencilIcon, Trash2Icon } from 'lucide-react'

function App() {
  const [songs, setSongs] = useState<Song[]>([])
  const [editingSong, setEditingSong] = useState<Song | null>(null)
  const [playlistName, setPlaylistName] = useState('')

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
    setEditingSong({ rank, name: song?.name || '', artist: song?.artist || '' })
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

  return (
    <div className="w-100 p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Chartify</h1>
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
                // onClick={() => generatePlaylist()}
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
                  {editingSong?.rank === song.rank ? (
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
  )
}

export default App
