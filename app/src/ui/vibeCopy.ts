import type { AudioFeatures, AudioMood } from '../audio/types'

type Slot = 'pagi' | 'siang' | 'sore' | 'malam' | 'larut'

function slotFor(date: Date): Slot {
  const h = date.getHours()
  if (h >= 4 && h < 10) return 'pagi'
  if (h >= 10 && h < 15) return 'siang'
  if (h >= 15 && h < 18) return 'sore'
  if (h >= 18 && h < 23) return 'malam'
  return 'larut'
}

/**
 * Kalimat pendek yang menghubungkan suasana lagu dengan momen pendengar.
 * Ditulis tangan per suasana × waktu — bukan dihasilkan AI.
 */
const LINES: Record<AudioMood, Record<Slot, string[]>> = {
  energetic: {
    pagi: ['Energinya tinggi — pas untuk membuka hari dengan semangat.', 'Bangun, bergerak, lagu ini yang pimpin.'],
    siang: ['Tempo kencang untuk mengusir kantuk siang.', 'Pas untuk mengejar tenggat sebelum sore.'],
    sore: ['Hentakannya cocok menemani perjalanan pulang.', 'Sisa tenaga hari ini? Lagu ini yang habiskan.'],
    malam: ['Malam masih panjang, lagunya juga belum mau pelan.', 'Volume naik sedikit, lagu ini layak.'],
    larut: ['Masih melek? Lagu ini jelas belum mau tidur.', 'Energi jam segini: langka, nikmati saja.'],
  },
  calm: {
    pagi: ['Tenang dan lembut, teman secangkir kopi pagi.', 'Pagi yang pelan memang paling enak.'],
    siang: ['Jeda sebentar, tarik napas bersama lagu ini.', 'Pelan-pelan saja, siang masih panjang.'],
    sore: ['Lembut seperti cahaya sore yang miring.', 'Pas untuk menurunkan tempo hari ini.'],
    malam: ['Lembut, pas untuk menutup hari.', 'Redupkan lampu, biarkan lagu ini bekerja.'],
    larut: ['Sunyi yang nyaman untuk jam-jam larut.', 'Teman yang tenang saat semua sudah tidur.'],
  },
  bright: {
    pagi: ['Cerah seperti matahari jam tujuh.', 'Ringan dan terang — mood pagi yang bagus.'],
    siang: ['Ringan dan cerah, gampang bikin senyum.', 'Lagu yang bikin siang terasa lebih pendek.'],
    sore: ['Ceria, cocok untuk sore yang santai.', 'Nada terangnya pas dengan langit sore.'],
    malam: ['Sedikit cahaya untuk malam ini.', 'Ringan dan manis, penutup hari yang baik.'],
    larut: ['Tetap cerah, bahkan selarut ini.', 'Lagu kecil yang menyalakan lampu di kepala.'],
  },
  warm: {
    pagi: ['Hangat, seperti sarapan yang tidak terburu-buru.', 'Penuh rasa, pelan-pelan membangunkan.'],
    siang: ['Hangat dan membumi di tengah hari.', 'Suara tebal yang enak didengar sambil kerja.'],
    sore: ['Hangat seperti teh sore.', 'Pas untuk ngobrol santai menjelang malam.'],
    malam: ['Hangat dan dekat, cocok untuk malam ini.', 'Lagu yang terasa seperti obrolan panjang.'],
    larut: ['Hangat, untuk menemani pikiran yang belum selesai.', 'Suara yang memeluk di jam-jam sepi.'],
  },
  balanced: {
    pagi: ['Seimbang — enak untuk memulai apa saja.', 'Tidak terburu-buru, tidak mengantuk. Pas.'],
    siang: ['Enak didengar sambil fokus bekerja.', 'Latar yang pas untuk siang produktif.'],
    sore: ['Mengalir santai menuju malam.', 'Tidak berlebihan, pas untuk sore ini.'],
    malam: ['Teman santai untuk malam biasa yang baik.', 'Mengalir tenang, cocok untuk malam.'],
    larut: ['Pelan tapi tetap hidup untuk jam segini.', 'Seimbang, menemani sampai kantuk datang.'],
  },
}

function hashText(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function vibeLine(features: AudioFeatures, seedText: string, now = new Date()): string {
  const options = LINES[features.mood][slotFor(now)]
  return options[hashText(seedText) % options.length] ?? ''
}
