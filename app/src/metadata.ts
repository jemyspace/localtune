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
          resolve({
            title: tag.tags.title?.trim() || undefined,
            artist: tag.tags.artist?.trim() || undefined,
            album: tag.tags.album?.trim() || undefined,
            genre: tag.tags.genre?.trim() || undefined,
          })
        },
        onError: () => resolve({}),
      })
    } catch {
      resolve({})
    }
  })
}
