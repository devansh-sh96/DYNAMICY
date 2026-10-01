import { Howl } from 'howler'

export type SoundEffect = 'drag' | 'click' | 'chime' | 'tick'

const frequencies: Record<SoundEffect, number[]> = {
  drag: [520, 420],
  click: [680],
  chime: [523.25, 659.25, 783.99],
  tick: [880]
}

const sounds = new Map<SoundEffect, Howl>()
const unavailableSounds = new Set<SoundEffect>()
const waitingToPlay = new Map<SoundEffect, number>()
let audioContext: AudioContext | undefined

const getAudioContext = () => {
  if (!audioContext && typeof window !== 'undefined' && window.AudioContext) {
    audioContext = new window.AudioContext()
  }
  return audioContext
}

const synthesize = (effect: SoundEffect) => {
  const context = getAudioContext()
  if (!context) return

  void context.resume()
  const now = context.currentTime
  frequencies[effect].forEach((frequency, index) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const startAt = now + index * (effect === 'chime' ? 0.075 : 0.035)
    const duration = effect === 'drag' ? 0.075 : effect === 'chime' ? 0.24 : 0.045
    oscillator.type = effect === 'drag' ? 'triangle' : 'sine'
    oscillator.frequency.setValueAtTime(frequency, startAt)
    if (effect === 'drag') oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.78, startAt + duration)
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(effect === 'chime' ? 0.045 : 0.025, startAt + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(startAt)
    oscillator.stop(startAt + duration + 0.01)
  })
}

const getSound = (effect: SoundEffect) => {
  const existing = sounds.get(effect)
  if (existing) return existing

  const sound = new Howl({
    src: [`/sounds/${effect}.mp3`],
    volume: 0.2,
    preload: true,
    onload: () => {
      const queued = waitingToPlay.get(effect) ?? 0
      waitingToPlay.delete(effect)
      for (let index = 0; index < queued; index += 1) sound.play()
    },
    onloaderror: () => {
      unavailableSounds.add(effect)
      const queued = waitingToPlay.get(effect) ?? 0
      waitingToPlay.delete(effect)
      for (let index = 0; index < queued; index += 1) synthesize(effect)
    }
  })

  sounds.set(effect, sound)
  return sound
}

const play = (effect: SoundEffect) => {
  if (typeof window === 'undefined') return
  if (unavailableSounds.has(effect)) {
    synthesize(effect)
    return
  }

  const sound = getSound(effect)
  if (sound.state() === 'loaded') {
    sound.play()
    return
  }

  waitingToPlay.set(effect, (waitingToPlay.get(effect) ?? 0) + 1)
}

export const AudioEngine = {
  playDrag: () => play('drag'),
  playClick: () => play('click'),
  playChime: () => play('chime'),
  playTick: () => play('tick')
}