import { AudioPlayer, AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

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
  /** 正文循环目标次数（1 = 不循环） */
  loopTarget: number;
  /** 当前正在播的是第几遍（从 1 开始） */
  loopIndex: number;
};

/** 只有正文音频参与循环，词汇/词块单条发音不循环 */
function isLoopable(id: string | null): boolean {
  return !!id && id.startsWith('body:');
}

let audioModeReady = false;

async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) return;
  audioModeReady = true;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      // 锁屏/通知栏媒体控制要求独占音频焦点，同时也保证别的 app 音乐会被暂停
      interruptionMode: 'doNotMix',
    });
  } catch {
    // 音频模式设置失败不影响播放
  }
}

class LessonPlayer {
  private sound: AudioPlayer | null = null;
  private statusSub: { remove: () => void } | null = null;
  currentId: string | null = null;
  playing = false;
  position = 0;
  duration = 0;
  loopTarget = 1;
  /** 已完整播完的遍数 */
  private loopDone = 0;
  snapshot: PlayerSnapshot = {
    currentId: null,
    playing: false,
    position: 0,
    duration: 0,
    progress: 0,
    loopTarget: 1,
    loopIndex: 1,
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
      loopTarget: this.loopTarget,
      loopIndex: Math.min(this.loopDone + 1, this.loopTarget),
    };
    this.listeners.forEach((fn) => fn());
  }

  /** 设置正文循环次数；播放中途改也立即生效 */
  setLoop(target: number): void {
    this.loopTarget = Math.max(1, Math.floor(target));
    this.emit();
  }

  isCurrent(id: string): boolean {
    return this.currentId === id;
  }

  private onStatus = (status: AudioStatus) => {
    this.playing = status.playing;
    // expo-audio 返回秒，UI 沿用毫秒
    this.position = Math.round(status.currentTime * 1000);
    this.duration = Math.round(status.duration * 1000);
    if (status.didJustFinish) {
      this.loopDone += 1;
      const sound = this.sound;
      if (sound && isLoopable(this.currentId) && this.loopDone < this.loopTarget) {
        // 还没播够次数：回到开头接着播下一遍
        this.playing = true;
        this.position = 0;
        sound
          .seekTo(0)
          .then(() => sound.play())
          .catch(() => {});
      } else {
        this.playing = false;
        this.position = 0;
        this.loopDone = 0;
        sound?.pause();
        sound?.seekTo(0).catch(() => {});
      }
    }
    this.emit();
  };

  private release() {
    this.statusSub?.remove();
    this.statusSub = null;
    if (this.sound) {
      // 必须先暂停再释放：只调 remove() 时底层 ExoPlayer 可能继续出声，
      // 造成两段音频同时播放。
      try {
        this.sound.pause();
      } catch {
        // 已释放则忽略
      }
      try {
        this.sound.clearLockScreenControls();
      } catch {
        // 未注册过锁屏控制则忽略
      }
      try {
        this.sound.remove();
      } catch {
        // 已释放则忽略
      }
      this.sound = null;
    }
  }

  private start(id: string, assetPath: string, title?: string): AudioPlayer {
    this.release();

    const sound = createAudioPlayer({ uri: assetToUri(assetPath) }, { updateInterval: 100 });
    this.statusSub = sound.addListener('playbackStatusUpdate', this.onStatus);
    this.sound = sound;
    this.currentId = id;
    this.position = 0;
    this.duration = 0;
    this.loopDone = 0;
    sound.play();
    try {
      // 注册到系统媒体会话：通知栏/锁屏显示播放卡片，后台可继续播放
      sound.setActiveForLockScreen(
        true,
        { title: title ?? '60s', artist: '60s 英语听读' },
        { showSeekForward: true, showSeekBackward: true },
      );
    } catch {
      // 个别机型媒体会话注册失败时不影响正常播放
    }
    this.emit();
    return sound;
  }

  async toggle(id: string, assetPath: string, title?: string): Promise<void> {
    await ensureAudioMode();

    if (this.currentId === id && this.sound) {
      if (this.playing) {
        this.sound.pause();
      } else {
        if (this.duration > 0 && this.position >= this.duration - 200) {
          await this.sound.seekTo(0);
          this.loopDone = 0;
        }
        this.sound.play();
      }
      return;
    }

    this.start(id, assetPath, title);
  }

  /** 从指定毫秒位置开始播放（用于点句跳转） */
  async playFrom(id: string, assetPath: string, ms: number, title?: string): Promise<void> {
    await ensureAudioMode();

    if (this.currentId === id && this.sound) {
      await this.sound.seekTo(ms / 1000);
      if (!this.playing) this.sound.play();
      return;
    }

    const sound = this.start(id, assetPath, title);
    if (ms > 0) {
      await sound.seekTo(ms / 1000).catch(() => {});
    }
  }

  async stop(): Promise<void> {
    this.release();
    this.currentId = null;
    this.playing = false;
    this.position = 0;
    this.duration = 0;
    this.loopDone = 0;
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
