import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js'

export interface BasicTags {
  title?: string
  artist?: string
  album?: string
  genre?: string
}

export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || fileName
}

export function readTags(file: File): Promise<BasicTags> {
  return new Promise((resolve) => {
    try {
      jsmediatags.read(file, {
        onSuccess: (tag) => {
          const raw = tag.tags as {
            title?: string
            artist?: string
            album?: string
            genre?: string | { data?: string }
            TCON?: string | { data?: string }
          }
          const genreField = raw.genre ?? raw.TCON
          const genre =
            typeof genreField === 'string'
              ? genreField.trim() || undefined
              : genreField?.data?.trim() || undefined
          resolve({
            title: raw.title?.trim() || undefined,
            artist: raw.artist?.trim() || undefined,
            album: raw.album?.trim() || undefined,
            genre,
          })
        },
        onError: () => resolve({}),
      })
    } catch {
      resolve({})
    }
  })
}
