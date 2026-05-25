/// <reference types="chrome" />
import { useEffect, useState } from 'react'
import { extractChartData } from './content'
import type { Song } from './content'
import { PencilIcon, Trash2Icon } from 'lucide-react'

function App() {
  const [songs, setSongs] = useState<Song[]>([])

  useEffect(() => {
    chrome.storage.local.get(['songs'], (result) => {
      if (Array.isArray(result.songs)) {
        setSongs(result.songs as Song[])
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

  function handleReset() {
    setSongs([])
    chrome.storage.local.set({ songs: [] })
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
          No songs found. Try on an Official Charts page.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {songs.map((song, i) => (
            <li
              key={i}
              className="py-3 flex items-center justify-between gap-2"
            >
              <div className="flex items-start gap-2">
                <p className="font-bold">{i + 1}.</p>

                <div className="flex flex-col">
                  <p className="font-semibold">{song.name}</p>
                  <p className="text-gray-500 text-sm">{song.artist}</p>
                </div>
              </div>

              <div className="flex">
                <button className="p-2 rounded-md hover:bg-gray-100 transition hover:cursor-pointer">
                  <PencilIcon className="w-4 h-4 text-gray-600 hover:text-gray-900" />
                </button>
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
      )}
    </div>
  )
}

export default App
