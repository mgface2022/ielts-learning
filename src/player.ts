import { Audio, AVPlaybackStatus } from 'expo-av';

export function assetToUri(assetPath: string): string {
  const rel = assetPath.replace(/^assets\//, '');
  return `file:///android_asset/${rel}`;
}

type Listener = () => void;

export type PlayerSnapshot = {
  currentId: string | null;
  playing: boolean;
  position: number;
  duration: number;
  progress: number;
};

class LessonPlayer {
  sound: Audio.Sound | null = null;
  currentId: string | null = null;
  playing = false;
  position = 0;
  duration = 0;
  snapshot: PlayerSnapshot = {
    currentId: null,
    playing: false,
    position: 0,
    duration: 0,
    progress: 0,
  };
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.snapshot = {
      currentId: this.currentId,
      playing: this.playing,
      position: this.position,
      duration: this.duration,
      progress: this.duration <= 0 ? 0 : Math.min(1, this.position / this.duration),
    };
    this.listeners.forEach((fn) => fn());
  }

  isCurrent(id: string): boolean {
    return this.currentId === id;
  }

  private onStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      this.playing = false;
      this.emit();
      return;
    }
    this.playing = status.isPlaying;
    this.position = status.positionMillis;
    this.duration = status.durationMillis ?? 0;
    if (status.didJustFinish) {
      this.playing = false;
      this.position = 0;
    }
    this.emit();
  };

  async toggle(id: string, assetPath: string): Promise<void> {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    if (this.currentId === id && this.sound) {
      const status = await this.sound.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        await this.sound.pauseAsync();
      } else if (status.isLoaded) {
        if (status.didJustFinish || status.positionMillis >= (status.durationMillis ?? 1) - 200) {
          await this.sound.setPositionAsync(0);
        }
        await this.sound.playAsync();
      }
      return;
    }

    if (this.sound) {
      await this.sound.unloadAsync();
      this.sound = null;
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri: assetToUri(assetPath) },
      { shouldPlay: true, progressUpdateIntervalMillis: 80 },
      this.onStatus,
    );
    this.sound = sound;
    this.currentId = id;
    this.emit();
  }

  async stop(): Promise<void> {
    if (this.sound) {
      await this.sound.unloadAsync();
      this.sound = null;
    }
    this.currentId = null;
    this.playing = false;
    this.position = 0;
    this.duration = 0;
    this.emit();
  }
}

export const player = new LessonPlayer();

export function formatMillis(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
