export type Song = {
  rank: number
  name: string
  artist: string
  validated: boolean | 'loading'
}

export function extractChartData(): Song[] {
  const songs: Song[] = []
  const chartList = document.querySelector('.chart-list')

  if (!chartList) return songs

  const chartItems = chartList.querySelectorAll('.chart-item')

  chartItems.forEach((item) => {
    const songNameEl = item.querySelector(
      '.chart-name span:not(.movement-icon)',
    )
    const artistEl = item.querySelector('.chart-artist span')

    if (songNameEl || artistEl) {
      songs.push({
        rank: songs.length + 1,
        name: songNameEl?.textContent.trim() || '',
        artist: artistEl?.textContent.trim() || '',
        validated: false,
      })
    }
  })

  return songs
}
