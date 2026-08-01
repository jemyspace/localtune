/// <reference types="vite/client" />

declare module 'jsmediatags/dist/jsmediatags.min.js' {
  interface TagData {
    tags: {
      title?: string
      artist?: string
      album?: string
      genre?: string
    }
  }

  const jsmediatags: {
    read: (
      file: Blob,
      callbacks: {
        onSuccess: (tag: TagData) => void
        onError: (error: { type: string; info: string }) => void
      },
    ) => void
  }

  export default jsmediatags
}
