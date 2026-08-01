const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i

export function isAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true
  return AUDIO_EXT.test(file.name)
}

export function makeTrackId(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`
}

export async function pickAudioFiles(): Promise<File[]> {
  if (typeof window.showDirectoryPicker === 'function') {
    try {
      const dir = await window.showDirectoryPicker()
      const files: File[] = []
      await collectAudioFromDir(dir, files)
      if (files.length > 0) return files
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return []
      // fall through to input
    }
  }

  return pickViaInput()
}

async function collectAudioFromDir(
  dir: FileSystemDirectoryHandle,
  out: File[],
): Promise<void> {
  for await (const handle of dir.values()) {
    if (handle.kind === 'file') {
      const file = await handle.getFile()
      if (isAudioFile(file)) out.push(file)
    } else if (handle.kind === 'directory') {
      await collectAudioFromDir(handle, out)
    }
  }
}

function pickViaInput(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac'
    input.multiple = true
    input.style.display = 'none'
    document.body.appendChild(input)
    input.addEventListener('change', () => {
      const list = input.files ? Array.from(input.files).filter(isAudioFile) : []
      input.remove()
      resolve(list)
    })
    input.addEventListener('cancel', () => {
      input.remove()
      resolve([])
    })
    input.click()
  })
}
