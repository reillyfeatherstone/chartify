/// <reference types="chrome" />
import { useState } from 'react'
import { extractChartData } from './content'
import type { Song } from './content'

function App() {
  const [songs, setSongs] = useState<Song[]>([])

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
  }

  return (
    <div className="w-100 p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Chartify</h1>
      <button
        onClick={() => handleGetSongs()}
        className="mb-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Get Songs
      </button>
      {songs.length === 0 ? (
        <p className="text-gray-500">
          No songs found. Try on an Official Charts page.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {songs.map((song, i) => (
            <li key={i} className="py-3 flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <p className="font-bold">{i + 1}.</p>

                <div className="flex flex-col">
                  <p className="font-semibold">{song.name}</p>
                  <p className="text-gray-500 text-sm">{song.artist}</p>
                </div>
              </div>

              <button
                onClick={() =>
                  setSongs((prev) => prev.filter((_, index) => index !== i))
                }
                className="text-red-500 text-sm hover:text-red-700"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default App
